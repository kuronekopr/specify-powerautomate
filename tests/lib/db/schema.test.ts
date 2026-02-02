import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/lib/db";
import { users, solutions, skillDefinitions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { cleanupTestUsers } from "../../helpers/db-helpers";

describe("DB Schema", () => {
  const db = getDb();
  const testEmails: string[] = [];
  const testSolutionIds: string[] = [];
  const testSkillIds: string[] = [];

  afterAll(async () => {
    // Clean up solutions first (FK dependency)
    for (const id of testSolutionIds) {
      await db.delete(solutions).where(eq(solutions.id, id));
    }
    for (const id of testSkillIds) {
      await db.delete(skillDefinitions).where(eq(skillDefinitions.id, id));
    }
    await cleanupTestUsers();
  });

  describe("users table", () => {
    it("should create a user with default values", async () => {
      const email = `test-schema-create-${Date.now()}@example.com`;
      testEmails.push(email);

      const [user] = await db
        .insert(users)
        .values({ email, passwordHash: "hash123" })
        .returning();

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toBe(email);
      expect(user.role).toBe("client");
      expect(user.createdAt).toBeInstanceOf(Date);
    });

    it("should enforce unique email constraint", async () => {
      const email = `test-schema-unique-${Date.now()}@example.com`;
      testEmails.push(email);

      await db.insert(users).values({ email, passwordHash: "hash" }).returning();

      await expect(
        db.insert(users).values({ email, passwordHash: "hash2" }).returning()
      ).rejects.toThrow();
    });

    it("should allow admin role", async () => {
      const email = `test-schema-admin-${Date.now()}@example.com`;
      testEmails.push(email);

      const [user] = await db
        .insert(users)
        .values({ email, role: "admin", passwordHash: "hash" })
        .returning();

      expect(user.role).toBe("admin");
    });
  });

  describe("solutions table", () => {
    it("should create a solution with FK to users", async () => {
      const email = `test-schema-sol-${Date.now()}@example.com`;
      testEmails.push(email);

      const [user] = await db
        .insert(users)
        .values({ email, passwordHash: "hash" })
        .returning();

      const [solution] = await db
        .insert(solutions)
        .values({ userId: user.id, name: "Test Solution" })
        .returning();

      testSolutionIds.push(solution.id);

      expect(solution).toBeDefined();
      expect(solution.userId).toBe(user.id);
      expect(solution.name).toBe("Test Solution");
    });
  });

  describe("skill_definitions table", () => {
    it("should enforce unique connectorId constraint", async () => {
      const connectorId = `test-connector-${Date.now()}`;

      const [skill] = await db
        .insert(skillDefinitions)
        .values({ connectorId, actionName: "Test Action" })
        .returning();

      testSkillIds.push(skill.id);

      await expect(
        db
          .insert(skillDefinitions)
          .values({ connectorId, actionName: "Duplicate" })
      ).rejects.toThrow();
    });
  });
});
