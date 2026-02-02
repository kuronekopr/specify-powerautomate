import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/logging", () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  logError: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/github/webhook/route";
import { inngest } from "@/inngest/client";

const mockSend = inngest.send as ReturnType<typeof vi.fn>;

const SECRET = "test-webhook-secret";

function sign(body: string): string {
  return (
    "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex")
  );
}

function createRequest(
  event: string,
  payload: Record<string, unknown>,
  { signature, secret }: { signature?: string; secret?: string } = {},
) {
  const body = JSON.stringify(payload);
  process.env.GITHUB_WEBHOOK_SECRET = secret ?? SECRET;
  const sig = signature ?? sign(body);
  return new Request("http://localhost:3000/api/github/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": event,
      "x-hub-signature-256": sig,
    },
    body,
  });
}

describe("POST /api/github/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
  });

  it("should return 401 when signature is missing", async () => {
    const body = JSON.stringify({ action: "closed" });
    const req = new Request("http://localhost:3000/api/github/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "issues",
      },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("should return 401 when signature is invalid", async () => {
    const req = createRequest(
      "issues",
      { action: "closed", issue: { number: 1 }, repository: { full_name: "o/r" } },
      { signature: "sha256=invalid" },
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("should send app/issue.closed event when issue is closed", async () => {
    const payload = {
      action: "closed",
      issue: { number: 42 },
      repository: { full_name: "owner/repo" },
    };
    const req = createRequest("issues", payload);
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.event).toBe("issue.closed");
    expect(mockSend).toHaveBeenCalledWith({
      name: "app/issue.closed",
      data: { issueNumber: 42, repo: "owner/repo" },
    });
  });

  it("should send app/pr.merged event when PR is merged", async () => {
    const payload = {
      action: "closed",
      pull_request: { number: 99, merged: true },
      repository: { full_name: "owner/repo" },
    };
    const req = createRequest("pull_request", payload);
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.event).toBe("pr.merged");
    expect(mockSend).toHaveBeenCalledWith({
      name: "app/pr.merged",
      data: { prNumber: 99, repo: "owner/repo" },
    });
  });

  it("should ignore PR closed without merge", async () => {
    const payload = {
      action: "closed",
      pull_request: { number: 99, merged: false },
      repository: { full_name: "owner/repo" },
    };
    const req = createRequest("pull_request", payload);
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.event).toBe("ignored");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("should ignore unrelated events", async () => {
    const payload = { action: "opened", sender: {} };
    const req = createRequest("push", payload);
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.event).toBe("ignored");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("should return 500 when secret is not configured", async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const body = JSON.stringify({ action: "closed" });
    const req = new Request("http://localhost:3000/api/github/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "issues",
        "x-hub-signature-256": "sha256=abc",
      },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
