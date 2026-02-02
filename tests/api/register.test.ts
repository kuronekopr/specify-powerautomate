import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cleanupTestUsers, getUserByEmail } from "../helpers/db-helpers";
import bcrypt from "bcryptjs";

// Import the route handler directly
import { POST } from "@/app/api/auth/register/route";

function createRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeAll(async () => {
    await cleanupTestUsers();
  });

  afterAll(async () => {
    await cleanupTestUsers();
  });

  it("should register a new user successfully", async () => {
    const email = `test-reg-ok-${Date.now()}@example.com`;
    const res = await POST(createRequest({ email, password: "Password123!" }));

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("should return 400 when email is missing", async () => {
    const res = await POST(createRequest({ password: "Password123!" }));
    expect(res.status).toBe(400);
  });

  it("should return 400 when password is missing", async () => {
    const res = await POST(
      createRequest({ email: "test-reg-nopw@example.com" })
    );
    expect(res.status).toBe(400);
  });

  it("should return 409 for duplicate email", async () => {
    const email = `test-reg-dup-${Date.now()}@example.com`;
    await POST(createRequest({ email, password: "Password123!" }));

    const res = await POST(createRequest({ email, password: "Other456!" }));
    expect(res.status).toBe(409);
  });

  it("should assign role=client by default", async () => {
    const email = `test-reg-role-${Date.now()}@example.com`;
    await POST(createRequest({ email, password: "Password123!" }));

    const user = await getUserByEmail(email);
    expect(user).not.toBeNull();
    expect(user!.role).toBe("client");
  });

  it("should store a bcrypt-hashed password", async () => {
    const email = `test-reg-hash-${Date.now()}@example.com`;
    const password = "SecurePass789!";
    await POST(createRequest({ email, password }));

    const user = await getUserByEmail(email);
    expect(user).not.toBeNull();
    expect(user!.passwordHash).not.toBe(password);
    const isValid = await bcrypt.compare(password, user!.passwordHash!);
    expect(isValid).toBe(true);
  });
});
