import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockFile } from "../helpers/mock-helpers";

vi.mock("@vercel/blob", () => ({
  put: vi.fn().mockResolvedValue({
    url: "https://blob.vercel-storage.com/test/file.txt",
    pathname: "test/file.txt",
  }),
  del: vi.fn().mockResolvedValue(undefined),
}));

import { uploadFile, deleteFile, addTimestampToFilename } from "@/lib/blob";
import { put, del } from "@vercel/blob";

describe("blob utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("addTimestampToFilename", () => {
    it("should add timestamp before extension", () => {
      const result = addTimestampToFilename("report.pdf");
      expect(result).toMatch(/^report_\d{14}\.pdf$/);
    });

    it("should handle filename without extension", () => {
      const result = addTimestampToFilename("README");
      expect(result).toMatch(/^README_\d{14}$/);
    });

    it("should handle filename with multiple dots", () => {
      const result = addTimestampToFilename("my.file.name.zip");
      expect(result).toMatch(/^my\.file\.name_\d{14}\.zip$/);
    });
  });

  describe("uploadFile", () => {
    it("should call put with timestamped path and file", async () => {
      const file = createMockFile("report.pdf", "pdf content", "application/pdf");
      const result = await uploadFile(file, "uploads/user1");

      expect(put).toHaveBeenCalledWith(
        expect.stringMatching(/^uploads\/user1\/report_\d{14}\.pdf$/),
        file,
        { access: "public" }
      );
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
