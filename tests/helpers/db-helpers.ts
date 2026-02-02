import { getDb } from "@/lib/db";
import {
  users,
  solutions,
  uploads,
  specVersions,
  skillDefinitions,
} from "@/lib/db/schema";
import { eq, like } from "drizzle-orm";

interface CreateTestUserOpts {
  email?: string;
  name?: string;
  passwordHash?: string;
  companyName?: string;
  role?: string;
}

export async function createTestUser(opts: CreateTestUserOpts = {}) {
  const db = getDb();
  const email = opts.email ?? `test-${crypto.randomUUID()}@example.com`;

  const [user] = await db
    .insert(users)
    .values({
      email,
      name: opts.name ?? "Test User",
      passwordHash: opts.passwordHash ?? null,
      companyName: opts.companyName ?? null,
      role: opts.role ?? "client",
    })
    .returning();

  return user;
}

export async function deleteTestUser(email: string) {
  const db = getDb();
  await db.delete(users).where(eq(users.email, email));
}

export async function cleanupTestUsers() {
  const db = getDb();
  // Find test user IDs first, then cascade-delete dependent rows
  const testUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, "test-%"));
  const ids = testUsers.map((u) => u.id);

  if (ids.length > 0) {
    const { inArray } = await import("drizzle-orm");
    // Delete in FK dependency order
    await db.delete(specVersions).where(inArray(specVersions.solutionId,
      db.select({ id: solutions.id }).from(solutions).where(inArray(solutions.userId, ids))
    ));
    await db.delete(uploads).where(inArray(uploads.solutionId,
      db.select({ id: solutions.id }).from(solutions).where(inArray(solutions.userId, ids))
    ));
    await db.delete(solutions).where(inArray(solutions.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }
}

export async function getUserByEmail(email: string) {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return user ?? null;
}

// ── Solution helpers ────────────────────────────────────────

export async function createTestSolution(
  userId: string,
  opts: { name?: string; description?: string } = {},
) {
  const db = getDb();
  const [sol] = await db
    .insert(solutions)
    .values({
      userId,
      name: opts.name ?? `test-sol-${crypto.randomUUID().slice(0, 8)}`,
      description: opts.description ?? null,
    })
    .returning();
  return sol;
}

export async function createTestUpload(
  solutionId: string,
  opts: {
    status?: string;
    fileUrl?: string;
    githubIssueNumber?: number;
    githubPrNumber?: number;
  } = {},
) {
  const db = getDb();
  const [upload] = await db
    .insert(uploads)
    .values({
      solutionId,
      fileUrl: opts.fileUrl ?? "https://blob.example.com/test.zip",
      status: opts.status ?? "pending",
      githubIssueNumber: opts.githubIssueNumber ?? null,
      githubPrNumber: opts.githubPrNumber ?? null,
    })
    .returning();
  return upload;
}

export async function createTestSpecVersion(
  solutionId: string,
  uploadId: string,
  opts: {
    versionNumber?: number;
    markdownContent?: string;
    isCurrent?: boolean;
  } = {},
) {
  const db = getDb();
  const [sv] = await db
    .insert(specVersions)
    .values({
      solutionId,
      uploadId,
      versionNumber: opts.versionNumber ?? 1,
      markdownContent: opts.markdownContent ?? "# Test spec",
      isCurrent: opts.isCurrent ?? true,
      changeReason: "テスト",
    })
    .returning();
  return sv;
}

export async function cleanupTestSolutions() {
  const db = getDb();
  const { inArray } = await import("drizzle-orm");

  // Find test solution IDs, then cascade-delete dependents
  const testSols = await db
    .select({ id: solutions.id })
    .from(solutions)
    .where(like(solutions.name, "test-%"));
  const ids = testSols.map((s) => s.id);

  if (ids.length > 0) {
    await db.delete(specVersions).where(inArray(specVersions.solutionId, ids));
    await db.delete(uploads).where(inArray(uploads.solutionId, ids));
    await db.delete(solutions).where(inArray(solutions.id, ids));
  }
}

export async function cleanupTestSkillDefinitions() {
  const db = getDb();
  await db
    .delete(skillDefinitions)
    .where(like(skillDefinitions.connectorId, "test-%"));
}
