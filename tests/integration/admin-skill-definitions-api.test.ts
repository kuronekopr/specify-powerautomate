import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createTestUser,
  cleanupTestUsers,
  cleanupTestSkillDefinitions,
} from "../helpers/db-helpers";

// ── Auth mock ───────────────────────────────────────────────
let mockSession: { user?: { id: string; email: string; role: string } } | null =
  null;

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession)),
}));

import {
  GET,
  POST,
  PUT,
} from "@/app/api/admin/skill-definitions/route";

// ── Helpers ─────────────────────────────────────────────────
function jsonRequest(body: Record<string, unknown>, method = "POST") {
  return new Request("http://localhost:3000/api/admin/skill-definitions", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Integration: /api/admin/skill-definitions", () => {
  let adminUser: { id: string; email: string; role: string };
  let clientUser: { id: string; email: string; role: string };

  beforeAll(async () => {
    await cleanupTestSkillDefinitions();
    await cleanupTestUsers();

    const admin = await createTestUser({
      email: `test-skill-admin-${Date.now()}@example.com`,
      role: "admin",
    });
    adminUser = { id: admin.id, email: admin.email, role: admin.role };

    const client = await createTestUser({
      email: `test-skill-client-${Date.now()}@example.com`,
      role: "client",
    });
    clientUser = { id: client.id, email: client.email, role: client.role };
  });

  afterAll(async () => {
    await cleanupTestSkillDefinitions();
    await cleanupTestUsers();
  });

  beforeEach(() => {
    mockSession = null;
  });

  // ── Auth & RBAC ─────────────────────────────────────────
  it("GET returns 403 for unauthenticated user", async () => {
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("POST returns 403 for client role", async () => {
    mockSession = { user: clientUser };
    const res = await POST(
      jsonRequest({ connectorId: "test-rbac-connector" }),
    );
    expect(res.status).toBe(403);
  });

  // ── Validation ──────────────────────────────────────────
  it("POST returns 400 when connectorId is missing", async () => {
    mockSession = { user: adminUser };
    const res = await POST(
      jsonRequest({ actionName: "something" }),
    );
    expect(res.status).toBe(400);
  });

  // ── CRUD flow ───────────────────────────────────────────
  it("POST creates, GET lists, PUT updates a skill definition", async () => {
    mockSession = { user: adminUser };

    // Create
    const connectorId = `test-crud-${Date.now()}`;
    const createRes = await POST(
      jsonRequest({
        connectorId,
        actionName: "SendEmail",
        businessMeaning: "メール送信",
        failureImpact: "通知遅延",
      }),
    );
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.id).toBeDefined();
    expect(created.connectorId).toBe(connectorId);
    expect(created.actionName).toBe("SendEmail");
    expect(created.businessMeaning).toBe("メール送信");

    // List
    const listRes = await GET();
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    const found = list.find((s: { id: string }) => s.id === created.id);
    expect(found).toBeDefined();

    // Update
    const updateRes = await PUT(
      jsonRequest(
        {
          id: created.id,
          connectorId,
          actionName: "SendEmailV2",
          businessMeaning: "メール送信（更新版）",
          failureImpact: "重大な通知遅延",
        },
        "PUT",
      ),
    );
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();
    expect(updated.actionName).toBe("SendEmailV2");
    expect(updated.businessMeaning).toBe("メール送信（更新版）");
    expect(updated.failureImpact).toBe("重大な通知遅延");
  });

  // ── Unique constraint ───────────────────────────────────
  it("POST returns 409 for duplicate connectorId", async () => {
    mockSession = { user: adminUser };

    const connectorId = `test-dup-${Date.now()}`;
    await POST(jsonRequest({ connectorId }));
    const res = await POST(jsonRequest({ connectorId }));
    expect(res.status).toBe(409);
  });

  // ── PUT not found ───────────────────────────────────────
  it("PUT returns 404 for non-existent id", async () => {
    mockSession = { user: adminUser };
    const res = await PUT(
      jsonRequest(
        { id: "00000000-0000-0000-0000-000000000000", connectorId: "nope" },
        "PUT",
      ),
    );
    expect(res.status).toBe(404);
  });

  // ── PUT validation ──────────────────────────────────────
  it("PUT returns 400 when id is missing", async () => {
    mockSession = { user: adminUser };
    const res = await PUT(
      jsonRequest({ connectorId: "test-no-id" }, "PUT"),
    );
    expect(res.status).toBe(400);
  });
});
