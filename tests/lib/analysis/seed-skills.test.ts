import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/lib/db";
import { skillDefinitions } from "@/lib/db/schema";
import { like } from "drizzle-orm";
import { seedSkillDefinitions, SEED_DATA } from "@/lib/analysis/seed-skills";

describe("seedSkillDefinitions", () => {
  beforeAll(async () => {
    // Clean up any leftover seeded data before tests
    const db = getDb();
    await db
      .delete(skillDefinitions)
      .where(like(skillDefinitions.connectorId, "shared_%"));
  }, 30000);

  afterAll(async () => {
    const db = getDb();
    await db
      .delete(skillDefinitions)
      .where(like(skillDefinitions.connectorId, "shared_%"));
  }, 30000);

  it("should insert all seed entries on first run", async () => {
    const result = await seedSkillDefinitions();

    expect(result.total).toBe(SEED_DATA.length);
    expect(result.inserted).toBe(SEED_DATA.length);
  }, 30000);

  it("should not duplicate entries on second run", async () => {
    const result = await seedSkillDefinitions();

    expect(result.total).toBe(SEED_DATA.length);
    expect(result.inserted).toBe(0);
  }, 30000);

  it("should have correct data in DB", async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(skillDefinitions)
      .where(like(skillDefinitions.connectorId, "shared_office365%"));

    // shared_office365 (connector-level) + SendEmailV2 + OnNewEmail = 3
    expect(rows.length).toBe(3);

    const sendEmail = rows.find(
      (r) => r.connectorId === "shared_office365/SendEmailV2"
    );
    expect(sendEmail).toBeDefined();
    expect(sendEmail!.actionName).toBe("SendEmailV2");
    expect(sendEmail!.businessMeaning).toContain("メール");
  });
});
