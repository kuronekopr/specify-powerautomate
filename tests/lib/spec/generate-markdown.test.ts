import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { parseZip } from "@/lib/analysis/parse-zip";
import { analyzePackage } from "@/lib/analysis/analyze-flow";
import { generateSpecMarkdown } from "@/lib/spec/generate-markdown";

const ZIP_PATH = path.resolve(
  "powerautomate_files/TestCloudflow2026020_20260202070901.zip"
);

const DEFAULT_META = {
  solutionName: "テストソリューション",
  packageName: "TestCloudflow2026020",
  createdAt: "2026-02-02T07:09:01Z",
  version: 1,
  changeReason: null,
};

async function getAnalysis() {
  const buffer = readFileSync(ZIP_PATH);
  const parsed = await parseZip(buffer);
  const [result] = analyzePackage(parsed, []);
  return result;
}

describe("generateSpecMarkdown", () => {
  it("should generate markdown with all 7 sections", async () => {
    const analysis = await getAnalysis();
    const md = generateSpecMarkdown(analysis, DEFAULT_META);

    expect(md).toContain("# 業務フロー仕様書:");
    expect(md).toContain("## 1. 概要");
    expect(md).toContain("## 2. 使用コネクタ一覧");
    expect(md).toContain("## 3. トリガー定義");
    expect(md).toContain("## 4. アクション定義");
    expect(md).toContain("## 5. 障害時の影響");
    expect(md).toContain("## 6. 確認事項・質問");
    expect(md).toContain("## 7. 変更履歴");
  });

  it("should include solution name and version in header", async () => {
    const analysis = await getAnalysis();
    const md = generateSpecMarkdown(analysis, DEFAULT_META);

    expect(md).toContain("テストソリューション");
    expect(md).toContain("v1");
  });

  it("should include flow display name", async () => {
    const analysis = await getAnalysis();
    const md = generateSpecMarkdown(analysis, DEFAULT_META);

    expect(md).toContain(
      "OneDrive に新しいファイルがアップロードされたときに通知とメールを受け取る"
    );
  });

  it("should include connector table rows", async () => {
    const analysis = await getAnalysis();
    const md = generateSpecMarkdown(analysis, DEFAULT_META);

    expect(md).toContain("onedriveforbusiness");
    expect(md).toContain("office365");
  });

  it("should include trigger rows with recurrence", async () => {
    const analysis = await getAnalysis();
    const md = generateSpecMarkdown(analysis, DEFAULT_META);

    expect(md).toContain("OnNewFilesV2");
    expect(md).toContain("15 Minute");
  });

  it("should include action rows", async () => {
    const analysis = await getAnalysis();
    const md = generateSpecMarkdown(analysis, DEFAULT_META);

    expect(md).toContain("SendEmailV2");
  });

  it("should include questions section", async () => {
    const analysis = await getAnalysis();
    const md = generateSpecMarkdown(analysis, DEFAULT_META);

    // Without skill defs, there should be questions
    expect(md).toContain("スキル定義が未登録");
  });

  it("should render default changeReason as 初版作成", async () => {
    const analysis = await getAnalysis();
    const md = generateSpecMarkdown(analysis, DEFAULT_META);

    expect(md).toContain("初版作成");
  });

  it("should handle blank fields with ― placeholder", async () => {
    const analysis = await getAnalysis();
    // All skill matches are null, so businessMeaning columns should be ―
    const md = generateSpecMarkdown(analysis, DEFAULT_META);

    // Without skill defs, trigger/action tables should have ― for businessMeaning
    // Check trigger table: last column should be ―
    const triggerSection = md.split("## 3. トリガー定義")[1]?.split("##")[0] ?? "";
    expect(triggerSection).toContain("― |");

    // Check action table: last column should be ―
    const actionSection = md.split("## 4. アクション定義")[1]?.split("##")[0] ?? "";
    expect(actionSection).toContain("― |");
  });

  it("should produce valid markdown tables (no broken pipes)", async () => {
    const analysis = await getAnalysis();
    const md = generateSpecMarkdown(analysis, DEFAULT_META);

    const lines = md.split("\n").filter((l) => l.startsWith("|"));
    for (const line of lines) {
      // Each table line should start and end with |
      expect(line.trim()).toMatch(/^\|.*\|$/);
      // Pipe count should be consistent within each table
      // (no empty cells that break the structure)
      expect(line).not.toContain("||");
    }
  });

  it("should handle empty analysis results without breaking", () => {
    const emptyAnalysis = {
      flowDisplayName: "",
      connectors: [],
      triggers: [],
      actions: [],
      questions: [],
    };
    const md = generateSpecMarkdown(emptyAnalysis, DEFAULT_META);

    // All sections should still be present
    expect(md).toContain("## 1. 概要");
    expect(md).toContain("## 2. 使用コネクタ一覧");
    expect(md).toContain("## 3. トリガー定義");
    expect(md).toContain("## 4. アクション定義");
    expect(md).toContain("## 5. 障害時の影響");
    expect(md).toContain("## 6. 確認事項・質問");
    expect(md).toContain("## 7. 変更履歴");

    // Empty tables should have placeholder rows
    const lines = md.split("\n").filter((l) => l.startsWith("|"));
    for (const line of lines) {
      expect(line.trim()).toMatch(/^\|.*\|$/);
    }
  });

  it("should handle null/undefined meta fields gracefully", () => {
    const emptyAnalysis = {
      flowDisplayName: "",
      connectors: [],
      triggers: [],
      actions: [],
      questions: [],
    };
    const md = generateSpecMarkdown(emptyAnalysis, {
      solutionName: "",
      packageName: "",
      createdAt: "",
      version: 1,
      changeReason: undefined,
    });

    // Should use ― for blank fields
    expect(md).toContain("―");
    // Should still have valid structure
    expect(md).toContain("## 1. 概要");
  });

  it("should escape pipe characters in values", () => {
    const analysis = {
      flowDisplayName: "Flow with | pipe",
      connectors: [
        { connectorId: "conn|1", displayName: "Name|With|Pipes", apiName: "api" },
      ],
      triggers: [],
      actions: [],
      questions: [],
    };
    const md = generateSpecMarkdown(analysis, DEFAULT_META);

    // Pipes inside table cells must be escaped
    expect(md).toContain("conn\\|1");
    expect(md).toContain("Name\\|With\\|Pipes");
    // Table structure should remain valid
    const tableLines = md.split("\n").filter((l) => l.startsWith("|"));
    for (const line of tableLines) {
      expect(line.trim()).toMatch(/^\|.*\|$/);
    }
  });

  it("should replace newlines in values to keep table rows single-line", () => {
    const analysis = {
      flowDisplayName: "Flow\nwith\nnewlines",
      connectors: [],
      triggers: [],
      actions: [],
      questions: [
        {
          category: "general" as const,
          target: "target",
          question: "Line1\nLine2\r\nLine3",
          reason: "reason",
        },
      ],
    };
    const md = generateSpecMarkdown(analysis, DEFAULT_META);

    // No raw newlines inside table rows
    const tableLines = md.split("\n").filter((l) => l.startsWith("|"));
    for (const line of tableLines) {
      expect(line).not.toMatch(/\n/);
    }
    expect(md).toContain("Line1 Line2 Line3");
  });
});
