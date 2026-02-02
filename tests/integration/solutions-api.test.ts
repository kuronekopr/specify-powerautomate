import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createTestUser,
  cleanupTestUsers,
  cleanupTestSolutions,
  createTestSolution,
} from "../helpers/db-helpers";

// ── Auth mock ───────────────────────────────────────────────
let mockSession: { user?: { id: string; email: string; role: string } } | null =
  null;

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession)),
}));

import { GET, POST } from "@/app/api/solutions/route";

// ── Helpers ─────────────────────────────────────────────────
function jsonRequest(
  body?: Record<string, unknown>,
  method: "GET" | "POST" = "POST",
) {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request("http://localhost:3000/api/solutions", init);
}

describe("Integration: /api/solutions", () => {
  let testUser: { id: string; email: string; role: string };

  beforeAll(async () => {
    await cleanupTestSolutions();
    await cleanupTestUsers();
    const u = await createTestUser({
      email: `test-sol-api-${Date.now()}@example.com`,
    });
    testUser = { id: u.id, email: u.email, role: u.role };
  });

  afterAll(async () => {
    await cleanupTestSolutions();
    await cleanupTestUsers();
  });

  beforeEach(() => {
    mockSession = null;
  });

  // ── Auth ────────────────────────────────────────────────
  it("GET returns 401 when not authenticated", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("POST returns 401 when not authenticated", async () => {
    const res = await POST(jsonRequest({ name: "x" }));
    expect(res.status).toBe(401);
  });

  // ── Validation ──────────────────────────────────────────
  it("POST returns 400 when name is missing", async () => {
    mockSession = { user: testUser };
    const res = await POST(jsonRequest({ description: "desc" }));
    expect(res.status).toBe(400);
  });

  it("POST returns 400 when name is empty string", async () => {
    mockSession = { user: testUser };
    const res = await POST(jsonRequest({ name: "  " }));
    expect(res.status).toBe(400);
  });

  // ── Create + List flow ──────────────────────────────────
  it("POST creates a solution and GET returns it", async () => {
    mockSession = { user: testUser };

    const createRes = await POST(
      jsonRequest({ name: "test-integ-sol", description: "テスト説明" }),
    );
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.id).toBeDefined();
    expect(created.name).toBe("test-integ-sol");
    expect(created.description).toBe("テスト説明");
    expect(created.userId).toBe(testUser.id);

    // Verify via GET
    const listRes = await GET();
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    const found = list.find((s: { id: string }) => s.id === created.id);
    expect(found).toBeDefined();
    expect(found.name).toBe("test-integ-sol");
  });

  // ── User isolation ──────────────────────────────────────
  it("GET returns only the authenticated user's solutions", async () => {
    // Create another user with a solution
    const otherUser = await createTestUser({
      email: `test-sol-other-${Date.now()}@example.com`,
    });
    await createTestSolution(otherUser.id, { name: "test-other-sol" });

    mockSession = { user: testUser };
    const res = await GET();
    const list = await res.json();

    // Should not contain the other user's solution
    const otherFound = list.find(
      (s: { name: string }) => s.name === "test-other-sol",
    );
    expect(otherFound).toBeUndefined();
  });
});
