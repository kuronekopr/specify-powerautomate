import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { solutions, uploads } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { logEvent } from "@/lib/logging";

/**
 * Client-upload flow for large ZIP files.
 *
 * The browser uses `upload()` from `@vercel/blob/client` which:
 *   1. Calls this route with `type: "blob.generate-client-token"` to get a
 *      signed upload token (we authorize here).
 *   2. Streams the file directly from the browser to Vercel Blob (no
 *      serverless function memory involved).
 *   3. Calls this route again with `type: "blob.upload-completed"` so we
 *      can create the DB record and fire the Inngest event.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: solutionId } = await params;
  const db = getDb();

  // Verify user owns this solution (shared by both phases)
  const [solution] = await db
    .select()
    .from(solutions)
    .where(
      and(eq(solutions.id, solutionId), eq(solutions.userId, session.user.id)),
    )
    .limit(1);

  if (!solution) {
    return NextResponse.json(
      { error: "ソリューションが見つかりません。" },
      { status: 404 },
    );
  }

  const body = (await req.json()) as HandleUploadBody;

  const jsonResponse = await handleUpload({
    body,
    request: req,
    onBeforeGenerateToken: async (_pathname) => {
      // Authorization is already verified above.
      return {
        allowedContentTypes: [
          "application/zip",
          "application/x-zip-compressed",
          "application/octet-stream",
        ],
        tokenPayload: JSON.stringify({
          userId: session.user.id,
          solutionId,
        }),
      };
    },
    onUploadCompleted: async ({ blob, tokenPayload }) => {
      const payload = JSON.parse(tokenPayload ?? "{}");
      const uid: string | undefined = payload.userId;
      const sid: string | undefined = payload.solutionId;

      if (!uid || !sid) {
        throw new Error("Invalid token payload");
      }

      // Create upload record
      const [upload] = await db
        .insert(uploads)
        .values({
          solutionId: sid,
          fileUrl: blob.url,
          status: "pending",
        })
        .returning();

      await logEvent({
        uploadId: upload.id,
        source: "api:upload",
        eventType: "upload.created",
        message: `Upload created for solution ${sid}`,
        metadata: { solutionId: sid, fileUrl: blob.url },
      });

      // Fire Inngest event
      await inngest.send({
        name: "app/upload.created",
        data: { uploadId: upload.id },
      });
    },
  });

  return NextResponse.json(jsonResponse);
}
