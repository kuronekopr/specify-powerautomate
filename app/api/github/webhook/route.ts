import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { inngest } from "@/inngest/client";
import { logEvent } from "@/lib/logging";

export async function POST(req: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 },
    );
  }

  // ── Signature verification ────────────────────────────────
  const signature = req.headers.get("x-hub-signature-256");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const body = await req.text();
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(body).digest("hex");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── Parse event ───────────────────────────────────────────
  const event = req.headers.get("x-github-event");
  const payload = JSON.parse(body);

  await logEvent({
    source: "webhook:github",
    eventType: "webhook.received",
    message: `GitHub webhook received: ${event}/${payload.action}`,
    metadata: { event, action: payload.action, repo: payload.repository?.full_name },
  });

  // ── Issue closed → app/issue.closed ───────────────────────
  if (event === "issues" && payload.action === "closed") {
    await inngest.send({
      name: "app/issue.closed",
      data: {
        issueNumber: payload.issue.number,
        repo: payload.repository.full_name,
      },
    });

    await logEvent({
      source: "webhook:github",
      eventType: "webhook.issue.closed",
      message: `Issue #${payload.issue.number} closed on ${payload.repository.full_name}`,
      metadata: { issueNumber: payload.issue.number, repo: payload.repository.full_name },
    });

    return NextResponse.json({ ok: true, event: "issue.closed" });
  }

  // ── PR merged → app/pr.merged ─────────────────────────────
  if (
    event === "pull_request" &&
    payload.action === "closed" &&
    payload.pull_request.merged
  ) {
    await inngest.send({
      name: "app/pr.merged",
      data: {
        prNumber: payload.pull_request.number,
        repo: payload.repository.full_name,
      },
    });

    await logEvent({
      source: "webhook:github",
      eventType: "webhook.pr.merged",
      message: `PR #${payload.pull_request.number} merged on ${payload.repository.full_name}`,
      metadata: { prNumber: payload.pull_request.number, repo: payload.repository.full_name },
    });

    return NextResponse.json({ ok: true, event: "pr.merged" });
  }

  // ── Unhandled event — acknowledge silently ────────────────
  await logEvent({
    source: "webhook:github",
    eventType: "webhook.ignored",
    message: `Ignored webhook event: ${event}/${payload.action}`,
    metadata: { event, action: payload.action },
  });

  return NextResponse.json({ ok: true, event: "ignored" });
}
