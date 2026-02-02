import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth
let mockSession: { user?: { role?: string } } | null = null;

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession)),
}));

// Mock next/navigation redirect - it throws to halt execution
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import Home from "@/app/page";
import { redirect } from "next/navigation";

describe("Root page (/)", () => {
  beforeEach(() => {
    mockSession = null;
    vi.clearAllMocks();
  });

  it("should redirect unauthenticated users to /login", async () => {
    await expect(Home()).rejects.toThrow("REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("should redirect admin users to /admin/dashboard", async () => {
    mockSession = { user: { role: "admin" } };
    await expect(Home()).rejects.toThrow("REDIRECT:/admin/dashboard");
    expect(redirect).toHaveBeenCalledWith("/admin/dashboard");
  });

  it("should redirect client users to /client/dashboard", async () => {
    mockSession = { user: { role: "client" } };
    await expect(Home()).rejects.toThrow("REDIRECT:/client/dashboard");
    expect(redirect).toHaveBeenCalledWith("/client/dashboard");
  });
});
