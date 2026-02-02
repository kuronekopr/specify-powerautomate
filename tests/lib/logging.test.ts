import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    insert: mockInsert,
  }),
}));

vi.mock("@/lib/db/schema", () => ({
  eventLogs: Symbol("eventLogs"),
}));

import { logEvent, logError } from "@/lib/logging";

describe("logEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockResolvedValue(undefined);
  });

  it("should insert an event log with default level", async () => {
    await logEvent({
      uploadId: "upload-123",
      source: "inngest:setup",
      eventType: "step.setup.started",
      message: "Setup started",
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith({
      uploadId: "upload-123",
      source: "inngest:setup",
      eventType: "step.setup.started",
      level: "info",
      message: "Setup started",
      metadata: null,
    });
  });

  it("should accept custom level and metadata", async () => {
    await logEvent({
      source: "webhook:github",
      eventType: "webhook.received",
      level: "warn",
      message: "Warning event",
      metadata: { key: "value" },
    });

    expect(mockValues).toHaveBeenCalledWith({
      uploadId: null,
      source: "webhook:github",
      eventType: "webhook.received",
      level: "warn",
      message: "Warning event",
      metadata: { key: "value" },
    });
  });

  it("should not throw when DB insert fails", async () => {
    mockValues.mockRejectedValue(new Error("DB error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      logEvent({
        source: "test",
        eventType: "test.event",
        message: "test",
      }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      "[logEvent] failed to write event log:",
      "test.event",
    );
    consoleSpy.mockRestore();
  });
});

describe("logError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockResolvedValue(undefined);
  });

  it("should extract Error stack into metadata", async () => {
    const error = new Error("Something broke");

    await logError({
      uploadId: "upload-456",
      source: "inngest:analyze",
      eventType: "step.analyze.error",
      message: "Analyze failed",
      error,
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadId: "upload-456",
        source: "inngest:analyze",
        eventType: "step.analyze.error",
        level: "error",
        message: "Analyze failed",
        metadata: expect.objectContaining({
          errorMessage: "Something broke",
          stack: expect.stringContaining("Something broke"),
        }),
      }),
    );
  });

  it("should handle non-Error objects", async () => {
    await logError({
      source: "test",
      eventType: "test.error",
      message: "Non-error failure",
      error: "string error",
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        metadata: expect.objectContaining({
          errorMessage: "string error",
          stack: "string error",
        }),
      }),
    );
  });

  it("should merge additional metadata with error info", async () => {
    const error = new Error("fail");

    await logError({
      source: "test",
      eventType: "test.error",
      message: "failed",
      error,
      metadata: { customKey: "customValue" },
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          customKey: "customValue",
          errorMessage: "fail",
          stack: expect.any(String),
        }),
      }),
    );
  });
});
