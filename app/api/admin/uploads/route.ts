import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { uploads, solutions, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const rows = await db
    .select({
      id: uploads.id,
      status: uploads.status,
      fileUrl: uploads.fileUrl,
      githubIssueNumber: uploads.githubIssueNumber,
      githubPrNumber: uploads.githubPrNumber,
      createdAt: uploads.createdAt,
      solutionName: solutions.name,
      solutionId: solutions.id,
      userName: users.name,
      userEmail: users.email,
    })
    .from(uploads)
    .leftJoin(solutions, eq(uploads.solutionId, solutions.id))
    .leftJoin(users, eq(solutions.userId, users.id))
    .orderBy(desc(uploads.createdAt));

  return NextResponse.json(rows);
}
