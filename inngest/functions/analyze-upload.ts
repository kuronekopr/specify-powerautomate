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
  createIssue,
  getIssue,
  getIssueComments,
  createBranch,
  commitFile,
  createPullRequest,
  getPullRequest,
} from "@/lib/github/client";
import {
  sendQuestionRequestEmail,
  sendApprovalRequestEmail,
  sendCompletionEmail,
} from "@/lib/email/send";

/**
 * Main workflow: triggered when a new upload is created.
 *
 * Steps:
 *   1. setup        – fetch upload/solution/user, download ZIP, parse
 *   2. analyze      – run analysis engine, generate questions
 *   3. create-issue – post questions as GitHub Issue
 *   4. generate-spec – generate markdown specification
 *   5. create-pr    – commit spec to branch, open PR
 *   6. finalize     – save spec_version, mark upload complete
 */
export const analyzeUpload = inngest.createFunction(
  {
    id: "analyze-upload",
    retries: 2,
  },
  { event: "app/upload.created" },
  async ({ event, step }) => {
    const { uploadId } = event.data as { uploadId: string };

    // ── Step 1: Setup ────────────────────────────────────────
    const setupResult = await step.run("setup", async () => {
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

      return {
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
    });

    // ── Step 2: Analyze ──────────────────────────────────────
    const analysisResult = await step.run("analyze", async () => {
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

      return {
        analysisJson: JSON.stringify(results),
        totalQuestions: results.reduce((sum, r) => sum + r.questions.length, 0),
      };
    });

    // ── Step 3: Create GitHub Issue ──────────────────────────
    const issueResult = await step.run("create-issue", async () => {
      const db = getDb();
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

      // Build issue body from questions
      const analyses = JSON.parse(analysisResult.analysisJson);
      let issueBody = `# 設計確認事項\n\n`;
      issueBody += `**パッケージ名:** ${setupResult.packageName}\n`;
      issueBody += `**フロー数:** ${setupResult.flowCount}\n\n`;

      for (const analysis of analyses) {
        issueBody += `## ${analysis.flowDisplayName}\n\n`;
        if (analysis.questions.length === 0) {
          issueBody += "確認事項はありません。\n\n";
        } else {
          for (let i = 0; i < analysis.questions.length; i++) {
            const q = analysis.questions[i];
            issueBody += `### Q${i + 1}. ${q.question}\n`;
            issueBody += `- **カテゴリ:** ${q.category}\n`;
            issueBody += `- **対象:** ${q.target}\n`;
            issueBody += `- **理由:** ${q.reason}\n\n`;
          }
        }
      }

      issueBody += `\n---\n回答完了後、この Issue を Close してください。`;

      const issue = await createIssue(
        ghToken,
        ghOwner,
        repoName,
        `[確認依頼] ${setupResult.packageName} 設計確認事項`,
        issueBody,
        ["確認依頼"]
      );

      // Save issue number
      await db
        .update(uploads)
        .set({
          status: "questions_open",
          githubIssueNumber: issue.number,
        })
        .where(eq(uploads.id, uploadId));

      return {
        issueNumber: issue.number,
        issueUrl: issue.html_url,
        repoFullName: repo.full_name,
        repoName,
        defaultBranch: repo.default_branch,
      };
    });

    // ── Email: 質問依頼 ────────────────────────────────────────
    await step.run("notify-question-request", async () => {
      await sendQuestionRequestEmail({
        to: setupResult.userEmail,
        packageName: setupResult.packageName,
        issueUrl: issueResult.issueUrl,
        questionCount: analysisResult.totalQuestions,
      });
    });

    // ── Wait for Issue Close ─────────────────────────────────
    await step.waitForEvent("wait-for-issue-close", {
      event: "app/issue.closed",
      match: "data.issueNumber",
      timeout: "30d",
    });

    // ── Step 4: Generate Spec ────────────────────────────────
    const specResult = await step.run("generate-spec", async () => {
      const db = getDb();
      const analyses = JSON.parse(analysisResult.analysisJson);
      const ghToken = process.env.GITHUB_TOKEN!;
      const ghOwner = process.env.GITHUB_OWNER!;

      // Fetch issue comments (answers)
      let answersText = "";
      try {
        const comments = await getIssueComments(
          ghToken,
          ghOwner,
          issueResult.repoName,
          issueResult.issueNumber
        );
        if (comments.length > 0) {
          answersText = comments.map((c) => c.body).join("\n\n");
        }
      } catch {
        // Proceed without answers if fetch fails
      }

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

      return {
        markdown: fullMarkdown,
        versionNumber,
        answersText,
      };
    });

    // ── Step 5: Create GitHub PR ─────────────────────────────
    const prResult = await step.run("create-pr", async () => {
      const db = getDb();
      const ghToken = process.env.GITHUB_TOKEN!;
      const ghOwner = process.env.GITHUB_OWNER!;

      const branchName = `spec/v${specResult.versionNumber}-${Date.now()}`;

      // Create branch
      await createBranch(
        ghToken,
        ghOwner,
        issueResult.repoName,
        branchName,
        issueResult.defaultBranch
      );

      // Commit spec file
      const filePath = `specs/${setupResult.packageName.replace(/\s+/g, "-")}/spec-v${specResult.versionNumber}.md`;
      const commitResult = await commitFile(
        ghToken,
        ghOwner,
        issueResult.repoName,
        filePath,
        specResult.markdown,
        `docs: add spec v${specResult.versionNumber} for ${setupResult.packageName}`,
        branchName
      );

      // Create PR
      const pr = await createPullRequest(
        ghToken,
        ghOwner,
        issueResult.repoName,
        `[仕様書] ${setupResult.packageName} v${specResult.versionNumber}`,
        [
          `## 仕様書ドラフト`,
          "",
          `- **パッケージ名:** ${setupResult.packageName}`,
          `- **バージョン:** v${specResult.versionNumber}`,
          `- **関連 Issue:** #${issueResult.issueNumber}`,
          "",
          `レビュー後、マージしてください。`,
        ].join("\n"),
        branchName,
        issueResult.defaultBranch
      );

      // Save PR number
      await db
        .update(uploads)
        .set({
          status: "pr_open",
          githubPrNumber: pr.number,
        })
        .where(eq(uploads.id, uploadId));

      return {
        prNumber: pr.number,
        prUrl: pr.html_url,
        commitSha: commitResult.commit.sha,
      };
    });

    // ── Email: 承認依頼 ────────────────────────────────────────
    await step.run("notify-approval-request", async () => {
      await sendApprovalRequestEmail({
        to: setupResult.userEmail,
        packageName: setupResult.packageName,
        prUrl: prResult.prUrl,
        version: specResult.versionNumber,
      });
    });

    // ── Wait for PR Merge ────────────────────────────────────
    await step.waitForEvent("wait-for-pr-merge", {
      event: "app/pr.merged",
      match: "data.prNumber",
      timeout: "30d",
    });

    // ── Step 6: Finalize ─────────────────────────────────────
    await step.run("finalize", async () => {
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
    });

    // ── Email: 完了通知 ──────────────────────────────────────
    await step.run("notify-completion", async () => {
      const repoUrl = `https://github.com/${issueResult.repoFullName}`;
      await sendCompletionEmail({
        to: setupResult.userEmail,
        packageName: setupResult.packageName,
        version: specResult.versionNumber,
        repoUrl,
      });
    });

    return {
      uploadId,
      solutionId: setupResult.solutionId,
      issueNumber: issueResult.issueNumber,
      prNumber: prResult.prNumber,
      version: specResult.versionNumber,
      status: "completed",
    };
  }
);
