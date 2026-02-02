import { describe, it, expect } from "vitest";
import { getDb, db } from "@/lib/db";

describe("DB module", () => {
  describe("getDb()", () => {
    it("should return a database instance", () => {
      const instance = getDb();
      expect(instance).toBeDefined();
    });

    it("should return the same instance (singleton)", () => {
      const a = getDb();
      const b = getDb();
      expect(a).toBe(b);
    });
  });

  describe("db proxy", () => {
    it("should proxy property access to the real db instance", () => {
      // The proxy should forward 'select' to the real db
      expect(typeof db.select).toBe("function");
    });

    it("should proxy insert method", () => {
      expect(typeof db.insert).toBe("function");
    });
  });
});
