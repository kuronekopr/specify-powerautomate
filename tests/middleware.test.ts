import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// Mock auth to return a configurable session
let mockSession: { user?: { role?: string } } | null = null;

vi.mock("@/lib/auth", () => ({
  auth: (handler: Function) => {
    // Return the handler itself so we can call it with a mock request
    return handler;
  },
}));

// Import after mock
import middleware from "@/middleware";

function createMockRequest(pathname: string) {
  return {
    nextUrl: { pathname },
    url: "http://localhost:3000",
    auth: mockSession,
  } as any;
}

describe("middleware", () => {
  beforeEach(() => {
    mockSession = null;
  });

  describe("auth pages (/login, /register)", () => {
    it("should allow unauthenticated access to /login", () => {
      const res = (middleware as any)(createMockRequest("/login"));
      // NextResponse.next() returns a response without redirect
      expect(res.headers?.get("location")).toBeNull();
    });

    it("should redirect authenticated admin from /login to /admin/dashboard", () => {
      mockSession = { user: { role: "admin" } };
      const res = (middleware as any)(createMockRequest("/login"));
      const location = new URL(res.headers.get("location"));
      expect(location.pathname).toBe("/admin/dashboard");
    });

    it("should redirect authenticated client from /register to /client/dashboard", () => {
      mockSession = { user: { role: "client" } };
      const res = (middleware as any)(createMockRequest("/register"));
      const location = new URL(res.headers.get("location"));
      expect(location.pathname).toBe("/client/dashboard");
    });
  });

  describe("admin routes", () => {
    it("should redirect unauthenticated users to /login", () => {
      const res = (middleware as any)(createMockRequest("/admin/dashboard"));
      const location = new URL(res.headers.get("location"));
      expect(location.pathname).toBe("/login");
    });

    it("should redirect non-admin users to /client/dashboard", () => {
      mockSession = { user: { role: "client" } };
      const res = (middleware as any)(createMockRequest("/admin/dashboard"));
      const location = new URL(res.headers.get("location"));
      expect(location.pathname).toBe("/client/dashboard");
    });

    it("should allow admin users to access admin routes", () => {
      mockSession = { user: { role: "admin" } };
      const res = (middleware as any)(createMockRequest("/admin/dashboard"));
      expect(res.headers?.get("location")).toBeNull();
    });
  });

  describe("client routes", () => {
    it("should redirect unauthenticated users to /login", () => {
      const res = (middleware as any)(createMockRequest("/client/dashboard"));
      const location = new URL(res.headers.get("location"));
      expect(location.pathname).toBe("/login");
    });

    it("should redirect admin users to /admin/dashboard", () => {
      mockSession = { user: { role: "admin" } };
      const res = (middleware as any)(createMockRequest("/client/dashboard"));
      const location = new URL(res.headers.get("location"));
      expect(location.pathname).toBe("/admin/dashboard");
    });
  });
});
