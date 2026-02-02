import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Resend SDK
const mockSend = vi.fn();

vi.mock("resend", () => {
  return {
    Resend: class MockResend {
      emails = { send: mockSend };
    },
  };
});

// Reset the singleton between tests
vi.mock("@/lib/email/send", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email/send")>(
    "@/lib/email/send"
  );
  return actual;
});

import {
  sendQuestionRequestEmail,
  sendApprovalRequestEmail,
  sendCompletionEmail,
} from "@/lib/email/send";

describe("Email notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({ data: { id: "email-123" }, error: null });
  });

  describe("sendQuestionRequestEmail", () => {
    it("should send question request email with correct params", async () => {
      const result = await sendQuestionRequestEmail({
        to: "client@example.com",
        packageName: "TestFlow",
        issueUrl: "https://github.com/owner/repo/issues/1",
        questionCount: 3,
      });

      expect(result.id).toBe("email-123");
      expect(mockSend).toHaveBeenCalledTimes(1);

      const call = mockSend.mock.calls[0][0];
      expect(call.to).toBe("client@example.com");
      expect(call.subject).toContain("確認依頼");
      expect(call.subject).toContain("TestFlow");
      expect(call.html).toContain("TestFlow");
      expect(call.html).toContain("3 件");
      expect(call.html).toContain("https://github.com/owner/repo/issues/1");
    });

    it("should escape HTML in package name", async () => {
      await sendQuestionRequestEmail({
        to: "client@example.com",
        packageName: '<script>alert("xss")</script>',
        issueUrl: "https://example.com",
        questionCount: 1,
      });

      const html = mockSend.mock.calls[0][0].html;
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("should throw on Resend error", async () => {
      mockSend.mockResolvedValueOnce({
        data: null,
        error: { message: "Invalid API key" },
      });

      await expect(
        sendQuestionRequestEmail({
          to: "x@example.com",
          packageName: "Test",
          issueUrl: "url",
          questionCount: 0,
        })
      ).rejects.toThrow("Email send failed: Invalid API key");
    });
  });

  describe("sendApprovalRequestEmail", () => {
    it("should send approval request email with correct params", async () => {
      const result = await sendApprovalRequestEmail({
        to: "client@example.com",
        packageName: "TestFlow",
        prUrl: "https://github.com/owner/repo/pull/5",
        version: 2,
      });

      expect(result.id).toBe("email-123");

      const call = mockSend.mock.calls[0][0];
      expect(call.subject).toContain("承認依頼");
      expect(call.subject).toContain("v2");
      expect(call.html).toContain("v2");
      expect(call.html).toContain("https://github.com/owner/repo/pull/5");
      expect(call.html).toContain("Pull Request");
    });

    it("should throw on Resend error", async () => {
      mockSend.mockResolvedValueOnce({
        data: null,
        error: { message: "Rate limited" },
      });

      await expect(
        sendApprovalRequestEmail({
          to: "x@example.com",
          packageName: "T",
          prUrl: "url",
          version: 1,
        })
      ).rejects.toThrow("Rate limited");
    });
  });

  describe("sendCompletionEmail", () => {
    it("should send completion email with correct params", async () => {
      const result = await sendCompletionEmail({
        to: "client@example.com",
        packageName: "TestFlow",
        version: 3,
        repoUrl: "https://github.com/owner/repo",
      });

      expect(result.id).toBe("email-123");

      const call = mockSend.mock.calls[0][0];
      expect(call.subject).toContain("完了");
      expect(call.subject).toContain("v3");
      expect(call.html).toContain("v3");
      expect(call.html).toContain("https://github.com/owner/repo");
      expect(call.html).toContain("登録完了");
    });

    it("should throw on Resend error", async () => {
      mockSend.mockResolvedValueOnce({
        data: null,
        error: { message: "Forbidden" },
      });

      await expect(
        sendCompletionEmail({
          to: "x@example.com",
          packageName: "T",
          version: 1,
          repoUrl: "url",
        })
      ).rejects.toThrow("Forbidden");
    });
  });

  describe("HTML template structure", () => {
    it("should produce valid HTML in all templates", async () => {
      await sendQuestionRequestEmail({
        to: "a@b.com",
        packageName: "P",
        issueUrl: "u",
        questionCount: 0,
      });
      await sendApprovalRequestEmail({
        to: "a@b.com",
        packageName: "P",
        prUrl: "u",
        version: 1,
      });
      await sendCompletionEmail({
        to: "a@b.com",
        packageName: "P",
        version: 1,
        repoUrl: "u",
      });

      for (const call of mockSend.mock.calls) {
        const html: string = call[0].html;
        // Should have opening and closing div
        expect(html).toContain("<div");
        expect(html).toContain("</div>");
        // Should have a heading
        expect(html).toMatch(/<h2>.*<\/h2>/);
        // Should have a CTA link
        expect(html).toContain("<a href=");
      }
    });
  });
});
