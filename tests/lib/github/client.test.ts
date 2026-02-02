import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  getOrCreateRepo,
  createIssue,
  getIssue,
  getIssueComments,
  createBranch,
  commitFile,
  createPullRequest,
  getPullRequest,
} from "@/lib/github/client";

const TOKEN = "ghp_test_token";
const OWNER = "test-owner";
const REPO = "test-repo";

function mockResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

describe("GitHub client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOrCreateRepo", () => {
    it("should return existing repo", async () => {
      const repoData = {
        full_name: "test-owner/test-repo",
        html_url: "https://github.com/test-owner/test-repo",
        default_branch: "main",
      };
      mockFetch.mockResolvedValueOnce(mockResponse(repoData));

      const result = await getOrCreateRepo(TOKEN, OWNER, REPO);
      expect(result.full_name).toBe("test-owner/test-repo");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should create repo when not found", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ message: "Not Found" }, 404));
      const newRepo = {
        full_name: "test-owner/test-repo",
        html_url: "https://github.com/test-owner/test-repo",
        default_branch: "main",
      };
      mockFetch.mockResolvedValueOnce(mockResponse(newRepo));

      const result = await getOrCreateRepo(TOKEN, OWNER, REPO);
      expect(result.full_name).toBe("test-owner/test-repo");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("createIssue", () => {
    it("should create an issue with title and body", async () => {
      const issueData = {
        number: 42,
        html_url: "https://github.com/test-owner/test-repo/issues/42",
        state: "open",
      };
      mockFetch.mockResolvedValueOnce(mockResponse(issueData));

      const result = await createIssue(
        TOKEN,
        OWNER,
        REPO,
        "Test Issue",
        "Body content",
        ["bug"]
      );

      expect(result.number).toBe(42);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.title).toBe("Test Issue");
      expect(callBody.labels).toEqual(["bug"]);
    });
  });

  describe("getIssue", () => {
    it("should fetch issue by number", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ number: 1, html_url: "url", state: "closed" })
      );
      const result = await getIssue(TOKEN, OWNER, REPO, 1);
      expect(result.state).toBe("closed");
    });
  });

  describe("getIssueComments", () => {
    it("should fetch comments for an issue", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse([
          { body: "Answer 1", user: { login: "user1" } },
          { body: "Answer 2", user: { login: "user2" } },
        ])
      );
      const result = await getIssueComments(TOKEN, OWNER, REPO, 1);
      expect(result).toHaveLength(2);
      expect(result[0].body).toBe("Answer 1");
    });
  });

  describe("createBranch", () => {
    it("should create branch from base ref", async () => {
      // First call: get base ref
      mockFetch.mockResolvedValueOnce(
        mockResponse({ ref: "refs/heads/main", object: { sha: "abc123" } })
      );
      // Second call: create new ref
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          ref: "refs/heads/spec/v1",
          object: { sha: "abc123" },
        })
      );

      const result = await createBranch(TOKEN, OWNER, REPO, "spec/v1", "main");
      expect(result.ref).toBe("refs/heads/spec/v1");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("commitFile", () => {
    it("should commit a file to a branch", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          content: { sha: "file-sha" },
          commit: {
            sha: "commit-sha",
            html_url: "https://github.com/commit",
          },
        })
      );

      const result = await commitFile(
        TOKEN,
        OWNER,
        REPO,
        "specs/test.md",
        "# Spec content",
        "Add spec",
        "spec/v1"
      );

      expect(result.commit.sha).toBe("commit-sha");
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.branch).toBe("spec/v1");
      // Content should be base64 encoded
      expect(callBody.content).toBe(
        Buffer.from("# Spec content", "utf-8").toString("base64")
      );
    });
  });

  describe("createPullRequest", () => {
    it("should create a pull request", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          number: 10,
          html_url: "https://github.com/test-owner/test-repo/pull/10",
          state: "open",
          merged: false,
        })
      );

      const result = await createPullRequest(
        TOKEN,
        OWNER,
        REPO,
        "PR Title",
        "PR Body",
        "spec/v1",
        "main"
      );

      expect(result.number).toBe(10);
      expect(result.state).toBe("open");
    });
  });

  describe("getPullRequest", () => {
    it("should fetch PR by number", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          number: 10,
          html_url: "url",
          state: "closed",
          merged: true,
        })
      );
      const result = await getPullRequest(TOKEN, OWNER, REPO, 10);
      expect(result.merged).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should throw on non-OK responses", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse("Forbidden", 403));

      await expect(getIssue(TOKEN, OWNER, REPO, 999)).rejects.toThrow(
        "GitHub API 403"
      );
    });
  });
});
