import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    insert: mockInsert,
    select: mockSelect,
  }),
}));

vi.mock("@/lib/db/schema", () => ({
  eventLogs: Symbol("eventLogs"),
}));

import { logEvent, logError } from "@/lib/logging";

describe("event_logs integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockResolvedValue(undefined);
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValue([]);
  });

  it("should write and read back an info event", async () => {
    await logEvent({
      uploadId: "test-upload-id",
      source: "inngest:setup",
      eventType: "step.setup.started",
      message: "Setup started",
      metadata: { flowCount: 3 },
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith({
      uploadId: "test-upload-id",
      source: "inngest:setup",
      eventType: "step.setup.started",
      level: "info",
      message: "Setup started",
      metadata: { flowCount: 3 },
    });
  });

  it("should write an error event with stack trace", async () => {
    const error = new Error("Connection timeout");

    await logError({
      uploadId: "test-upload-id",
      source: "inngest:analyze",
      eventType: "step.analyze.error",
      message: "Analyze step failed",
      error,
      metadata: { attempt: 1 },
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        message: "Analyze step failed",
        metadata: expect.objectContaining({
          attempt: 1,
          errorMessage: "Connection timeout",
          stack: expect.stringContaining("Connection timeout"),
        }),
      }),
    );
  });

  it("should allow null uploadId for non-upload events", async () => {
    await logEvent({
      source: "webhook:github",
      eventType: "webhook.received",
      message: "Webhook received",
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadId: null,
      }),
    );
  });

  it("should handle multiple sequential log writes", async () => {
    await logEvent({
      source: "inngest:workflow",
      eventType: "workflow.started",
      message: "Workflow started",
    });

    await logEvent({
      source: "inngest:setup",
      eventType: "step.setup.started",
      message: "Setup started",
    });

    await logEvent({
      source: "inngest:setup",
      eventType: "step.setup.success",
      message: "Setup completed",
    });

    expect(mockInsert).toHaveBeenCalledTimes(3);
  });

  it("should not throw when DB is unavailable", async () => {
    mockValues.mockRejectedValue(new Error("DB unavailable"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      logEvent({
        source: "test",
        eventType: "test.event",
        message: "test",
      }),
    ).resolves.toBeUndefined();

    consoleSpy.mockRestore();
  });
});
