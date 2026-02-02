import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockFile } from "../helpers/mock-helpers";

// Mock auth
let mockSession: { user?: { id?: string; role?: string } } | null = null;

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession)),
}));

vi.mock("@/lib/blob", () => ({
  uploadFile: vi.fn().mockResolvedValue({
    url: "https://blob.vercel-storage.com/uploads/user1/file.txt",
  }),
}));

import { POST } from "@/app/api/upload/route";
import { uploadFile } from "@/lib/blob";

function createUploadRequest(file?: File) {
  const formData = new FormData();
  if (file) {
    formData.append("file", file);
  }
  return new Request("http://localhost:3000/api/upload", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/upload", () => {
  beforeEach(() => {
    mockSession = null;
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    const res = await POST(createUploadRequest(createMockFile()));
    expect(res.status).toBe(401);
  });

  it("should return 400 when no file is provided", async () => {
    mockSession = { user: { id: "user-1", role: "client" } };
    const res = await POST(createUploadRequest());
    expect(res.status).toBe(400);
  });

  it("should upload file successfully when authenticated", async () => {
    mockSession = { user: { id: "user-1", role: "client" } };
    const file = createMockFile("spec.docx", "content", "application/octet-stream");
    const res = await POST(createUploadRequest(file));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toBeDefined();
    expect(uploadFile).toHaveBeenCalledWith(expect.any(File), "uploads/user-1");
  });
});
