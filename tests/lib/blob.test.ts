import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockFile } from "../helpers/mock-helpers";

vi.mock("@vercel/blob", () => ({
  put: vi.fn().mockResolvedValue({
    url: "https://blob.vercel-storage.com/test/file.txt",
    pathname: "test/file.txt",
  }),
  del: vi.fn().mockResolvedValue(undefined),
}));

import { uploadFile, deleteFile } from "@/lib/blob";
import { put, del } from "@vercel/blob";

describe("blob utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("uploadFile", () => {
    it("should call put with correct path and file", async () => {
      const file = createMockFile("report.pdf", "pdf content", "application/pdf");
      const result = await uploadFile(file, "uploads/user1");

      expect(put).toHaveBeenCalledWith("uploads/user1/report.pdf", file, {
        access: "public",
      });
      expect(result.url).toBe("https://blob.vercel-storage.com/test/file.txt");
    });
  });

  describe("deleteFile", () => {
    it("should call del with the provided URL", async () => {
      const url = "https://blob.vercel-storage.com/test/file.txt";
      await deleteFile(url);

      expect(del).toHaveBeenCalledWith(url);
    });
  });
});
