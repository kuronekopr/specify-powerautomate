import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createTestUser,
  createTestSolution,
  createTestUpload,
  cleanupTestUsers,
  cleanupTestSolutions,
} from "../helpers/db-helpers";

// ── Auth mock ───────────────────────────────────────────────
let mockSession: { user?: { id: string; email: string; role: string } } | null =
  null;

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession)),
}));

import { GET } from "@/app/api/admin/uploads/route";

describe("Integration: /api/admin/uploads", () => {
  let adminUser: { id: string; email: string; role: string };
  let clientUser: { id: string; email: string; role: string };

  beforeAll(async () => {
    await cleanupTestSolutions();
    await cleanupTestUsers();

    const admin = await createTestUser({
      email: `test-admin-upl-${Date.now()}@example.com`,
      name: "Admin User",
      role: "admin",
    });
    adminUser = { id: admin.id, email: admin.email, role: admin.role };

    const client = await createTestUser({
      email: `test-client-upl-${Date.now()}@example.com`,
      name: "Client User",
      role: "client",
    });
    clientUser = { id: client.id, email: client.email, role: client.role };

    // Create solution + uploads
    const sol = await createTestSolution(client.id, {
      name: "test-admin-upl-sol",
    });
    await createTestUpload(sol.id, { status: "pending" });
    await createTestUpload(sol.id, {
      status: "completed",
      githubIssueNumber: 10,
      githubPrNumber: 20,
    });
  });

  afterAll(async () => {
    await cleanupTestSolutions();
    await cleanupTestUsers();
  });

  beforeEach(() => {
    mockSession = null;
  });

  it("returns 403 when not authenticated", async () => {
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 403 when authenticated as client", async () => {
    mockSession = { user: clientUser };
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns all uploads with user and solution info for admin", async () => {
    mockSession = { user: adminUser };
    const res = await GET();
    expect(res.status).toBe(200);

    const rows = await res.json();
    expect(rows.length).toBeGreaterThanOrEqual(2);

    // Check that joined fields are present
    const completed = rows.find(
      (r: { status: string; solutionName: string }) =>
        r.status === "completed" && r.solutionName === "test-admin-upl-sol",
    );
    expect(completed).toBeDefined();
    expect(completed.userName).toBe("Client User");
    expect(completed.githubIssueNumber).toBe(10);
    expect(completed.githubPrNumber).toBe(20);
  });

  it("returns rows ordered by createdAt descending", async () => {
    mockSession = { user: adminUser };
    const res = await GET();
    const rows = await res.json();

    for (let i = 1; i < rows.length; i++) {
      const prev = new Date(rows[i - 1].createdAt).getTime();
      const curr = new Date(rows[i].createdAt).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });
});
