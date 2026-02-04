import { inngest } from "@/inngest/client";
import { getDb } from "@/lib/db";
import {
  uploads,
  solutions,
  users,
  skillDefinitions,
  specVersions,
} from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { parseZip } from "@/lib/analysis/parse-zip";
import { analyzePackage } from "@/lib/analysis/analyze-flow";
import { generateSpecMarkdown } from "@/lib/spec/generate-markdown";
import {
  getOrCreateRepo,
  createBranch,
  commitFile,
  createPullRequest,
  listRepoWebhooks,
  createRepoWebhook,
} from "@/lib/github/client";
import {
  sendApprovalRequestEmail,
  sendCompletionEmail,
} from "@/lib/email/send";
import { logEvent, logError } from "@/lib/logging";

/**
 * Main workflow: triggered when a new upload is created.
 *
 * Steps:
 *   1. setup        – fetch upload/solution/user, download ZIP, parse
 *   2. analyze      – run analysis engine, ensure GitHub repo & webhook
 *   3. generate-spec – generate markdown specification
 *   4. create-pr    – commit spec to branch, open PR
 *   5. finalize     – save spec_version, mark upload complete
 */
export const analyzeUpload = inngest.createFunction(
  {
    id: "analyze-upload",
    retries: 2,
  },
  { event: "app/upload.created" },
  async ({ event, step }) => {
    const { uploadId } = event.data as { uploadId: string };

    await logEvent({
      uploadId,
      source: "inngest:workflow",
      eventType: "workflow.started",
      message: `Workflow started for upload ${uploadId}`,
    });

    // ── Step 1: Setup ────────────────────────────────────────
    const setupResult = await step.run("setup", async () => {
      await logEvent({
        uploadId,
        source: "inngest:setup",
        eventType: "step.setup.started",
        message: "Setup step started",
      });

      try {
        const db = getDb();

        const [upload] = await db
          .select()
          .from(uploads)
          .where(eq(uploads.id, uploadId))
          .limit(1);

        if (!upload) throw new Error(`Upload ${uploadId} not found`);

        const [solution] = await db
          .select()
          .from(solutions)
          .where(eq(solutions.id, upload.solutionId!))
          .limit(1);

        if (!solution) throw new Error(`Solution not found for upload`);

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, solution.userId!))
          .limit(1);

        if (!user) throw new Error(`User not found for solution`);

        // Update status
        await db
          .update(uploads)
          .set({ status: "analyzing" })
          .where(eq(uploads.id, uploadId));

        // Download ZIP from Vercel Blob
        if (!upload.fileUrl) throw new Error("No file URL on upload");
        const res = await fetch(upload.fileUrl);
        if (!res.ok) throw new Error(`Failed to download ZIP: ${res.status}`);
        const buffer = await res.arrayBuffer();

        // Parse ZIP
        const parsed = await parseZip(buffer);

        const result = {
          uploadId: upload.id,
          solutionId: solution.id,
          solutionName: solution.name,
          githubRepoName: solution.githubRepoName,
          userId: user.id,
          userEmail: user.email,
          userGithubUsername: user.githubUsername,
          packageName: parsed.manifest.details.displayName,
          packageCreatedAt: parsed.manifest.details.createdTime,
          flowCount: parsed.flows.length,
          // Serialize parsed data for next step
          parsedJson: JSON.stringify(parsed),
        };

        await logEvent({
          uploadId,
          source: "inngest:setup",
          eventType: "step.setup.success",
          message: `Setup completed: ${result.flowCount} flows found`,
          metadata: { solutionId: solution.id, flowCount: result.flowCount },
        });

        return result;
      } catch (err) {
        await logError({
          uploadId,
          source: "inngest:setup",
          eventType: "step.setup.error",
          message: "Setup step failed",
          error: err,
        });
        throw err;
      }
    });

    // ── Step 2: Analyze & GitHub Setup ───────────────────────
    const analysisResult = await step.run("analyze", async () => {
      await logEvent({
        uploadId,
        source: "inngest:analyze",
        eventType: "step.analyze.started",
        message: "Analyze step started",
      });

      try {
        const db = getDb();
        const parsed = JSON.parse(setupResult.parsedJson);

        // Fetch skill definitions from DB
        const skills = await db.select().from(skillDefinitions);
        const skillRows = skills.map((s) => ({
          connectorId: s.connectorId,
          actionName: s.actionName,
          businessMeaning: s.businessMeaning,
          failureImpact: s.failureImpact,
        }));

        const results = analyzePackage(parsed, skillRows);

        // ── GitHub Setup ──
        const ghToken = process.env.GITHUB_TOKEN;
        if (!ghToken) throw new Error("GITHUB_TOKEN not configured");
        const ghOwner = process.env.GITHUB_OWNER;
        if (!ghOwner) throw new Error("GITHUB_OWNER not configured");

        const repoName =
          setupResult.githubRepoName ??
          `spec-${setupResult.solutionName.toLowerCase().replace(/\s+/g, "-")}`;

        // Ensure repo exists
        const repo = await getOrCreateRepo(ghToken, ghOwner, repoName);

        // Save repo name back to solution if not set
        if (!setupResult.githubRepoName) {
          await db
            .update(solutions)
            .set({ githubRepoName: repoName })
            .where(eq(solutions.id, setupResult.solutionId));
        }

        // Ensure Webhook Exists
        const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
        if (!webhookSecret) {
          await logEvent({
            uploadId,
            source: "inngest:analyze",
            eventType: "webhook.config.missing",
            message: "GITHUB_WEBHOOK_SECRET not set, skipping webhook creation.",
          });
        } else {
           // Determine Base URL
           // VERCEL_PROJECT_PRODUCTION_URL is the reliable production domain on Vercel
           // NEXT_PUBLIC_APP_URL is often used for custom domains
           let baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
             (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null);

           if (!baseUrl && process.env.VERCEL_URL) {
             baseUrl = `https://${process.env.VERCEL_URL}`;
           }

           if (!baseUrl) {
             await logEvent({
               uploadId,
               source: "inngest:analyze",
               eventType: "webhook.url.missing",
               message: "Could not determine Base URL for Webhook.",
             });
           } else {
             const webhookUrl = `${baseUrl}/api/github/webhook`;
             try {
               const hooks = await listRepoWebhooks(ghToken, ghOwner, repoName);
               const exists = hooks.some(h => h.config.url === webhookUrl);

               if (!exists) {
                 await createRepoWebhook(ghToken, ghOwner, repoName, webhookUrl, webhookSecret);
                 await logEvent({
                   uploadId,
                   source: "inngest:analyze",
                   eventType: "webhook.created",
                   message: `Created webhook for ${repoName}: ${webhookUrl}`,
                 });
               }
             } catch (err) {
               // Log but don't fail, as analysis is successful
                await logError({
                 uploadId,
                 source: "inngest:analyze",
                 eventType: "webhook.create.error",
                 message: "Failed to create/check webhook.",
                 error: err,
               });
             }
           }
        }

        const result = {
          analysisJson: JSON.stringify(results),
          repoName,
          repoFullName: repo.full_name,
          defaultBranch: repo.default_branch,
        };

        await logEvent({
          uploadId,
          source: "inngest:analyze",
          eventType: "step.analyze.success",
          message: `Analysis completed. Repo: ${repoName}`,
        });

        return result;
      } catch (err) {
        await logError({
          uploadId,
          source: "inngest:analyze",
          eventType: "step.analyze.error",
          message: "Analyze step failed",
          error: err,
        });
        throw err;
      }
    });

    // ── Step 3: Generate Spec ────────────────────────────────
    const specResult = await step.run("generate-spec", async () => {
      await logEvent({
        uploadId,
        source: "inngest:generate-spec",
        eventType: "step.generate-spec.started",
        message: "Generate spec step started",
      });

      try {
        const db = getDb();
        const analyses = JSON.parse(analysisResult.analysisJson);

        // Determine version number
        const existingVersions = await db
          .select({ versionNumber: specVersions.versionNumber })
          .from(specVersions)
          .where(eq(specVersions.solutionId, setupResult.solutionId))
          .orderBy(desc(specVersions.versionNumber))
          .limit(1);

        const versionNumber =
          existingVersions.length > 0
            ? (existingVersions[0].versionNumber ?? 0) + 1
            : 1;

        // Generate markdown for each flow
        const markdowns = analyses.map((analysis: any) =>
          generateSpecMarkdown(analysis, {
            solutionName: setupResult.solutionName,
            packageName: setupResult.packageName,
            createdAt: setupResult.packageCreatedAt,
            version: versionNumber,
            changeReason: versionNumber === 1 ? "初版作成" : "更新",
          })
        );

        const fullMarkdown = markdowns.join("\n\n---\n\n");

        // Update status
        await db
          .update(uploads)
          .set({ status: "drafting" })
          .where(eq(uploads.id, uploadId));

        const result = {
          markdown: fullMarkdown,
          versionNumber,
        };

        await logEvent({
          uploadId,
          source: "inngest:generate-spec",
          eventType: "step.generate-spec.success",
          message: `Spec v${versionNumber} generated`,
          metadata: { versionNumber },
        });

        return result;
      } catch (err) {
        await logError({
          uploadId,
          source: "inngest:generate-spec",
          eventType: "step.generate-spec.error",
          message: "Generate spec step failed",
          error: err,
        });
        throw err;
      }
    });

    // ── Step 4: Create GitHub PR ─────────────────────────────
    const prResult = await step.run("create-pr", async () => {
      await logEvent({
        uploadId,
        source: "inngest:create-pr",
        eventType: "step.create-pr.started",
        message: "Create PR step started",
      });

      try {
        const db = getDb();
        const ghToken = process.env.GITHUB_TOKEN!;
        const ghOwner = process.env.GITHUB_OWNER!;

        const branchName = `spec/v${specResult.versionNumber}-${Date.now()}`;

        // Create branch
        await createBranch(
          ghToken,
          ghOwner,
          analysisResult.repoName,
          branchName,
          analysisResult.defaultBranch
        );

        // Commit spec file
        const filePath = `specs/${setupResult.packageName.replace(/\s+/g, "-")}/spec-v${specResult.versionNumber}.md`;
        const commitResult = await commitFile(
          ghToken,
          ghOwner,
          analysisResult.repoName,
          filePath,
          specResult.markdown,
          `docs: add spec v${specResult.versionNumber} for ${setupResult.packageName}`,
          branchName
        );

        // Create PR
        const pr = await createPullRequest(
          ghToken,
          ghOwner,
          analysisResult.repoName,
          `[仕様書] ${setupResult.packageName} v${specResult.versionNumber}`,
          [
            `## 仕様書ドラフト`,
            "",
            `- **パッケージ名:** ${setupResult.packageName}`,
            `- **バージョン:** v${specResult.versionNumber}`,
            "",
            `修正が必要な場合は、Files Changed からコメント、またはこの PR にコメントしてください。`,
            `確認後、問題なければ Merge してください。`,
          ].join("\n"),
          branchName,
          analysisResult.defaultBranch
        );

        // Save PR number
        await db
          .update(uploads)
          .set({
            status: "pr_open",
            githubPrNumber: pr.number,
          })
          .where(eq(uploads.id, uploadId));

        const result = {
          prNumber: pr.number,
          prUrl: pr.html_url,
          commitSha: commitResult.commit.sha,
        };

        await logEvent({
          uploadId,
          source: "inngest:create-pr",
          eventType: "step.create-pr.success",
          message: `PR #${pr.number} created`,
          metadata: { prNumber: pr.number, branchName },
        });

        return result;
      } catch (err) {
        await logError({
          uploadId,
          source: "inngest:create-pr",
          eventType: "step.create-pr.error",
          message: "Create PR step failed",
          error: err,
        });
        throw err;
      }
    });

    // ── Email: 承認依頼 ────────────────────────────────────────
    await step.run("notify-approval-request", async () => {
      await logEvent({
        uploadId,
        source: "inngest:notify",
        eventType: "step.notify-approval.started",
        message: "Sending approval request email",
      });

      try {
        await sendApprovalRequestEmail({
          to: setupResult.userEmail,
          packageName: setupResult.packageName,
          prUrl: prResult.prUrl,
          version: specResult.versionNumber,
        });

        await logEvent({
          uploadId,
          source: "inngest:notify",
          eventType: "step.notify-approval.success",
          message: `Approval request email sent to ${setupResult.userEmail}`,
        });
      } catch (err) {
        await logError({
          uploadId,
          source: "inngest:notify",
          eventType: "step.notify-approval.error",
          message: "Failed to send approval request email",
          error: err,
        });
        throw err;
      }
    });

    // ── Wait for PR Merge (無期限) ───────────────────────────
    await logEvent({
      uploadId,
      source: "inngest:workflow",
      eventType: "step.wait-pr-merge.started",
      message: `Waiting for PR #${prResult.prNumber} to merge`,
      metadata: { prNumber: prResult.prNumber },
    });

    await step.waitForEvent("wait-for-pr-merge", {
      event: "app/pr.merged",
      if: `async.data.prNumber == ${prResult.prNumber}`,
      timeout: "365d",
    });

    await logEvent({
      uploadId,
      source: "inngest:workflow",
      eventType: "step.wait-pr-merge.resumed",
      message: `PR #${prResult.prNumber} merged, resuming workflow`,
      metadata: { prNumber: prResult.prNumber },
    });

    // ── Step 5: Finalize ─────────────────────────────────────
    await step.run("finalize", async () => {
      await logEvent({
        uploadId,
        source: "inngest:finalize",
        eventType: "step.finalize.started",
        message: "Finalize step started",
      });

      try {
        const db = getDb();

        // Mark previous versions as not current
        await db
          .update(specVersions)
          .set({ isCurrent: false })
          .where(
            and(
              eq(specVersions.solutionId, setupResult.solutionId),
              eq(specVersions.isCurrent, true)
            )
          );

        // Save new spec version
        await db.insert(specVersions).values({
          solutionId: setupResult.solutionId,
          uploadId,
          versionNumber: specResult.versionNumber,
          markdownContent: specResult.markdown,
          changeReason:
            specResult.versionNumber === 1 ? "初版作成" : "更新",
          githubCommitSha: prResult.commitSha,
          isCurrent: true,
        });

        // Mark upload as completed
        await db
          .update(uploads)
          .set({ status: "completed" })
          .where(eq(uploads.id, uploadId));

        await logEvent({
          uploadId,
          source: "inngest:finalize",
          eventType: "step.finalize.success",
          message: `Upload ${uploadId} finalized as v${specResult.versionNumber}`,
          metadata: { versionNumber: specResult.versionNumber },
        });
      } catch (err) {
        await logError({
          uploadId,
          source: "inngest:finalize",
          eventType: "step.finalize.error",
          message: "Finalize step failed",
          error: err,
        });
        throw err;
      }
    });

    // ── Email: 完了通知 ──────────────────────────────────────
    await step.run("notify-completion", async () => {
      await logEvent({
        uploadId,
        source: "inngest:notify",
        eventType: "step.notify-completion.started",
        message: "Sending completion email",
      });

      try {
        const repoUrl = `https://github.com/${analysisResult.repoFullName}`;
        await sendCompletionEmail({
          to: setupResult.userEmail,
          packageName: setupResult.packageName,
          version: specResult.versionNumber,
          repoUrl,
        });

        await logEvent({
          uploadId,
          source: "inngest:notify",
          eventType: "step.notify-completion.success",
          message: `Completion email sent to ${setupResult.userEmail}`,
        });
      } catch (err) {
        await logError({
          uploadId,
          source: "inngest:notify",
          eventType: "step.notify-completion.error",
          message: "Failed to send completion email",
          error: err,
        });
        throw err;
      }
    });

    await logEvent({
      uploadId,
      source: "inngest:workflow",
      eventType: "workflow.completed",
      message: `Workflow completed for upload ${uploadId}`,
      metadata: {
        solutionId: setupResult.solutionId,
        prNumber: prResult.prNumber,
        version: specResult.versionNumber,
      },
    });

    return {
      uploadId,
      solutionId: setupResult.solutionId,
      prNumber: prResult.prNumber,
      version: specResult.versionNumber,
      status: "completed",
    };
  }
);
