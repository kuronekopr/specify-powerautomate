import type { FlowAnalysisResult, TriggerInfo, ActionInfo, ConnectorInfo, Question } from "@/lib/analysis/types";

/**
 * Blank-safe helper: always returns a string, never undefined/null.
 * If value is falsy or only whitespace, returns the fallback (default "―").
 * Pipe characters are escaped to prevent markdown table breakage.
 * Newlines are replaced with spaces to keep rows on a single line.
 */
function safe(value: string | null | undefined, fallback = "―"): string {
  if (!value || value.trim() === "") return fallback;
  return value
    .trim()
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

/**
 * Generate a consistent markdown specification document from analysis results.
 *
 * Design principles:
 * - Every section is ALWAYS output, even when data is empty
 * - Blank/null fields render as "―" so table structure never breaks
 * - Table columns are fixed per section; rows are "なし" when empty
 */
export function generateSpecMarkdown(
  analysis: FlowAnalysisResult,
  meta: {
    solutionName: string;
    packageName: string;
    createdAt: string;
    version: number;
    changeReason?: string | null;
  }
): string {
  const sections: string[] = [];

  // ── Header ─────────────────────────────────────────────────
  sections.push(renderHeader(analysis, meta));

  // ── 1. Overview ────────────────────────────────────────────
  sections.push(renderOverview(analysis, meta));

  // ── 2. Connectors ──────────────────────────────────────────
  sections.push(renderConnectors(analysis.connectors));

  // ── 3. Trigger ─────────────────────────────────────────────
  sections.push(renderTriggers(analysis.triggers));

  // ── 4. Actions ─────────────────────────────────────────────
  sections.push(renderActions(analysis.actions));

  // ── 5. Error / Failure Impact ──────────────────────────────
  sections.push(renderFailureImpact(analysis.triggers, analysis.actions));

  // ── 6. Questions / Confirmation Items ──────────────────────
  sections.push(renderQuestions(analysis.questions));

  // ── 7. Change History ──────────────────────────────────────
  sections.push(renderChangeHistory(meta));

  return sections.join("\n\n---\n\n") + "\n";
}

// ── Section renderers ────────────────────────────────────────────

function renderHeader(
  analysis: FlowAnalysisResult,
  meta: { solutionName: string; version: number }
): string {
  return [
    `# 業務フロー仕様書: ${safe(analysis.flowDisplayName)}`,
    "",
    `**ソリューション名:** ${safe(meta.solutionName)}`,
    `**バージョン:** v${meta.version}`,
  ].join("\n");
}

function renderOverview(
  analysis: FlowAnalysisResult,
  meta: { packageName: string; createdAt: string }
): string {
  const triggerSummary =
    analysis.triggers.length > 0
      ? analysis.triggers
          .map((t) => safe(t.skillMatch?.businessMeaning, safe(t.operationId)))
          .join("、")
      : "―";

  const actionSummary =
    analysis.actions.length > 0
      ? analysis.actions
          .map((a) => safe(a.skillMatch?.businessMeaning, safe(a.operationId)))
          .join("、")
      : "―";

  return [
    "## 1. 概要",
    "",
    `| 項目 | 内容 |`,
    `| --- | --- |`,
    `| フロー名 | ${safe(analysis.flowDisplayName)} |`,
    `| パッケージ名 | ${safe(meta.packageName)} |`,
    `| エクスポート日時 | ${safe(meta.createdAt)} |`,
    `| トリガー概要 | ${triggerSummary} |`,
    `| アクション概要 | ${actionSummary} |`,
    `| コネクタ数 | ${analysis.connectors.length} |`,
  ].join("\n");
}

function renderConnectors(connectors: ConnectorInfo[]): string {
  const lines = [
    "## 2. 使用コネクタ一覧",
    "",
    "| # | コネクタID | 表示名 | API名 |",
    "| --- | --- | --- | --- |",
  ];

  if (connectors.length === 0) {
    lines.push("| ― | ― | ― | ― |");
  } else {
    connectors.forEach((c, i) => {
      lines.push(
        `| ${i + 1} | ${safe(c.connectorId)} | ${safe(c.displayName)} | ${safe(c.apiName)} |`
      );
    });
  }

  return lines.join("\n");
}

function renderTriggers(triggers: TriggerInfo[]): string {
  const lines = [
    "## 3. トリガー定義",
    "",
    "| # | トリガー名 | 種別 | コネクタ | オペレーション | 実行間隔 | ビジネス上の意味 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];

  if (triggers.length === 0) {
    lines.push("| ― | ― | ― | ― | ― | ― | ― |");
  } else {
    triggers.forEach((t, i) => {
      const recurrence = t.recurrence
        ? `${t.recurrence.interval} ${t.recurrence.frequency}`
        : "―";
      lines.push(
        `| ${i + 1} | ${safe(t.name)} | ${safe(t.type)} | ${safe(t.connectorId)} | ${safe(t.operationId)} | ${recurrence} | ${safe(t.skillMatch?.businessMeaning)} |`
      );
    });
  }

  return lines.join("\n");
}

function renderActions(actions: ActionInfo[]): string {
  const lines = [
    "## 4. アクション定義",
    "",
    "| # | アクション名 | 種別 | コネクタ | オペレーション | 依存先 | ビジネス上の意味 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];

  if (actions.length === 0) {
    lines.push("| ― | ― | ― | ― | ― | ― | ― |");
  } else {
    actions.forEach((a, i) => {
      const deps = a.dependsOn.length > 0 ? a.dependsOn.join(", ") : "―";
      lines.push(
        `| ${i + 1} | ${safe(a.name)} | ${safe(a.type)} | ${safe(a.connectorId)} | ${safe(a.operationId)} | ${deps} | ${safe(a.skillMatch?.businessMeaning)} |`
      );
    });
  }

  return lines.join("\n");
}

function renderFailureImpact(
  triggers: TriggerInfo[],
  actions: ActionInfo[]
): string {
  const lines = [
    "## 5. 障害時の影響",
    "",
    "| # | 対象 | 種類 | 障害時の影響 |",
    "| --- | --- | --- | --- |",
  ];

  const items = [
    ...triggers.map((t) => ({
      name: t.name,
      kind: "トリガー",
      impact: t.skillMatch?.failureImpact,
    })),
    ...actions.map((a) => ({
      name: a.name,
      kind: "アクション",
      impact: a.skillMatch?.failureImpact,
    })),
  ];

  if (items.length === 0) {
    lines.push("| ― | ― | ― | ― |");
  } else {
    items.forEach((item, i) => {
      lines.push(
        `| ${i + 1} | ${safe(item.name)} | ${safe(item.kind)} | ${safe(item.impact)} |`
      );
    });
  }

  return lines.join("\n");
}

function renderQuestions(questions: Question[]): string {
  const lines = [
    "## 6. 確認事項・質問",
    "",
    "| # | カテゴリ | 対象 | 質問内容 | 理由 |",
    "| --- | --- | --- | --- | --- |",
  ];

  if (questions.length === 0) {
    lines.push("| ― | ― | ― | ― | ― |");
  } else {
    questions.forEach((q, i) => {
      lines.push(
        `| ${i + 1} | ${safe(q.category)} | ${safe(q.target)} | ${safe(q.question)} | ${safe(q.reason)} |`
      );
    });
  }

  return lines.join("\n");
}

function renderChangeHistory(meta: {
  version: number;
  createdAt: string;
  changeReason?: string | null;
}): string {
  return [
    "## 7. 変更履歴",
    "",
    "| バージョン | 日時 | 変更理由 |",
    "| --- | --- | --- |",
    `| v${meta.version} | ${safe(meta.createdAt)} | ${safe(meta.changeReason, "初版作成")} |`,
  ].join("\n");
}
