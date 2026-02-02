import { describe, it, expect } from "vitest";
import * as inngestRoute from "@/app/api/inngest/route";

describe("Inngest route handlers", () => {
  it("should export GET handler", () => {
    expect(inngestRoute.GET).toBeDefined();
    expect(typeof inngestRoute.GET).toBe("function");
  });

  it("should export POST handler", () => {
    expect(inngestRoute.POST).toBeDefined();
    expect(typeof inngestRoute.POST).toBe("function");
  });

  it("should export PUT handler", () => {
    expect(inngestRoute.PUT).toBeDefined();
    expect(typeof inngestRoute.PUT).toBe("function");
  });
});
