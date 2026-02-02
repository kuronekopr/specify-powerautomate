import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
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
  await db.delete(users).where(like(users.email, "test-%"));
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
