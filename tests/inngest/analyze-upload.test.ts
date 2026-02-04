import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// ── Mocks ────────────────────────────────────────────────────────

// Mock logging
vi.mock("@/lib/logging", () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  logError: vi.fn().mockResolvedValue(undefined),
}));

// Mock DB
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbDelete = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    delete: mockDbDelete,
  }),
}));

// Mock GitHub client
vi.mock("@/lib/github/client", () => ({
  getOrCreateRepo: vi.fn().mockResolvedValue({
    full_name: "owner/test-repo",
    html_url: "https://github.com/owner/test-repo",
    default_branch: "main",
  }),
  createBranch: vi.fn().mockResolvedValue({
    ref: "refs/heads/spec/v1",
    object: { sha: "abc" },
  }),
  commitFile: vi.fn().mockResolvedValue({
    content: { sha: "file-sha" },
    commit: { sha: "commit-sha-123", html_url: "url" },
  }),
  createPullRequest: vi.fn().mockResolvedValue({
    number: 5,
    html_url: "https://github.com/owner/test-repo/pull/5",
    state: "open",
    merged: false,
  }),
  getPullRequest: vi.fn().mockResolvedValue({
    number: 5,
    state: "closed",
    merged: true,
  }),
}));

// Mock blob fetch
const mockFetchForBlob = vi.fn();
vi.stubGlobal("fetch", mockFetchForBlob);

import { parseZip } from "@/lib/analysis/parse-zip";
import { analyzePackage } from "@/lib/analysis/analyze-flow";
import { generateSpecMarkdown } from "@/lib/spec/generate-markdown";
import {
  getOrCreateRepo,
  commitFile,
  createPullRequest,
  createBranch,
} from "@/lib/github/client";

const ZIP_PATH = path.resolve(
  "powerautomate_files/TestCloudflow2026020_20260202070901.zip"
);

describe("analyze-upload workflow (unit tests)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Step 1: Setup - ZIP parsing", () => {
    it("should parse ZIP from buffer", async () => {
      const buffer = readFileSync(ZIP_PATH);
      const parsed = await parseZip(buffer);

      expect(parsed.flows).toHaveLength(1);
      expect(parsed.manifest.details.displayName).toBe("TestCloudflow2026020");
    });
  });

  describe("Step 2: Analysis", () => {
    it("should produce analysis results from parsed ZIP", async () => {
      const buffer = readFileSync(ZIP_PATH);
      const parsed = await parseZip(buffer);
      const results = analyzePackage(parsed, []);

      expect(results).toHaveLength(1);
      expect(results[0].triggers.length).toBeGreaterThan(0);
      expect(results[0].actions.length).toBeGreaterThan(0);
      expect(results[0].questions.length).toBeGreaterThan(0);
    });

    it("should ensure repo exists during analysis", async () => {
      await getOrCreateRepo("token", "owner", "spec-repo");
      expect(getOrCreateRepo).toHaveBeenCalledWith(
        "token",
        "owner",
        "spec-repo"
      );
    });
  });

  describe("Step 3: Spec generation", () => {
    it("should generate consistent markdown from analysis", async () => {
      const buffer = readFileSync(ZIP_PATH);
      const parsed = await parseZip(buffer);
      const [analysis] = analyzePackage(parsed, []);

      const md = generateSpecMarkdown(analysis, {
        solutionName: "Test Solution",
        packageName: "TestCloudflow2026020",
        createdAt: "2026-02-02T07:09:01Z",
        version: 1,
        changeReason: null,
      });

      expect(md).toContain("# 業務フロー仕様書:");
      expect(md).toContain("## 4. アクション定義");
      // Verify table integrity
      const tableLines = md.split("\n").filter((l) => l.startsWith("|"));
      for (const line of tableLines) {
        expect(line.trim()).toMatch(/^\|.*\|$/);
      }
    });

    it("should produce identical output for same input", async () => {
      const buffer = readFileSync(ZIP_PATH);
      const parsed = await parseZip(buffer);
      const [analysis] = analyzePackage(parsed, []);

      const meta = {
        solutionName: "Test",
        packageName: "Test",
        createdAt: "2026-01-01",
        version: 1,
        changeReason: null,
      };

      const md1 = generateSpecMarkdown(analysis, meta);
      const md2 = generateSpecMarkdown(analysis, meta);

      expect(md1).toBe(md2);
    });
  });

  describe("Step 4: PR creation", () => {
    it("should create branch, commit file, and open PR", async () => {
      await createBranch("token", "owner", "repo", "spec/v1", "main");
      expect(createBranch).toHaveBeenCalled();

      const commitResult = await commitFile(
        "token",
        "owner",
        "repo",
        "specs/test.md",
        "# content",
        "commit msg",
        "spec/v1"
      );
      expect(commitResult.commit.sha).toBe("commit-sha-123");

      const pr = await createPullRequest(
        "token",
        "owner",
        "repo",
        "PR Title",
        "PR Body",
        "spec/v1",
        "main"
      );
      expect(pr.number).toBe(5);
    });
  });

  describe("End-to-end flow data integrity", () => {
    it("should maintain data consistency across all steps", async () => {
      // Step 1: Parse
      const buffer = readFileSync(ZIP_PATH);
      const parsed = await parseZip(buffer);

      // Step 2: Analyze
      const [analysis] = analyzePackage(parsed, []);

      // Step 3: Generate spec
      const md = generateSpecMarkdown(analysis, {
        solutionName: "E2E Test",
        packageName: parsed.manifest.details.displayName,
        createdAt: parsed.manifest.details.createdTime,
        version: 1,
        changeReason: null,
      });

      // Verify flow name appears consistently
      const flowName = analysis.flowDisplayName;
      expect(md).toContain(flowName);

      // Verify connector count matches
      expect(md).toContain(`コネクタ数 | ${analysis.connectors.length}`);

      // Verify trigger operation appears
      for (const trigger of analysis.triggers) {
        expect(md).toContain(trigger.operationId);
      }

      // Verify action operation appears
      for (const action of analysis.actions) {
        expect(md).toContain(action.operationId);
      }
    });
  });
});
