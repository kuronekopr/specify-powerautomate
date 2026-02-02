import { getDb } from "@/lib/db";
import { eventLogs } from "@/lib/db/schema";

export interface LogEventParams {
  uploadId?: string;
  source: string;
  eventType: string;
  level?: "info" | "warn" | "error";
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Insert an event log row. Failures are caught so logging never breaks the workflow.
 */
export async function logEvent(params: LogEventParams): Promise<void> {
  try {
    const db = getDb();
    await db.insert(eventLogs).values({
      uploadId: params.uploadId ?? null,
      source: params.source,
      eventType: params.eventType,
      level: params.level ?? "info",
      message: params.message,
      metadata: params.metadata ?? null,
    });
  } catch {
    // Never let logging break the workflow
    console.error("[logEvent] failed to write event log:", params.eventType);
  }
}

/**
 * Convenience wrapper that extracts Error.stack into metadata and sets level to "error".
 */
export async function logError(
  params: Omit<LogEventParams, "level"> & { error: unknown },
): Promise<void> {
  const err = params.error;
  const stack =
    err instanceof Error ? err.stack : String(err);
  const errorMessage =
    err instanceof Error ? err.message : String(err);

  await logEvent({
    ...params,
    level: "error",
    message: params.message || errorMessage,
    metadata: {
      ...params.metadata,
      errorMessage,
      stack,
    },
  });
}
