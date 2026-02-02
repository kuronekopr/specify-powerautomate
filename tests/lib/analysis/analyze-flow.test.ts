import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { parseZip } from "@/lib/analysis/parse-zip";
import { analyzePackage } from "@/lib/analysis/analyze-flow";

const ZIP_PATH = path.resolve(
  "powerautomate_files/TestCloudflow2026020_20260202070901.zip"
);

async function loadTestPackage() {
  const buffer = readFileSync(ZIP_PATH);
  return parseZip(buffer);
}

// Skill definitions that match the test flow connectors
const MATCHING_SKILLS = [
  {
    connectorId: "shared_onedriveforbusiness",
    actionName: null,
    businessMeaning: "OneDrive for Business ファイル操作",
    failureImpact: "ファイル操作停止",
  },
  {
    connectorId: "shared_onedriveforbusiness/OnNewFilesV2",
    actionName: "OnNewFilesV2",
    businessMeaning: "新規ファイル検知",
    failureImpact: "検知遅延",
  },
  {
    connectorId: "shared_office365/SendEmailV2",
    actionName: "SendEmailV2",
    businessMeaning: "メール送信",
    failureImpact: "通知停止",
  },
];

describe("analyzePackage", () => {
  it("should return one result per flow", async () => {
    const parsed = await loadTestPackage();
    const results = analyzePackage(parsed, []);
    expect(results).toHaveLength(1);
  });

  it("should extract flow display name", async () => {
    const parsed = await loadTestPackage();
    const [result] = analyzePackage(parsed, []);
    expect(result.flowDisplayName).toBe(
      "OneDrive に新しいファイルがアップロードされたときに通知とメールを受け取る"
    );
  });

  it("should extract connectors", async () => {
    const parsed = await loadTestPackage();
    const [result] = analyzePackage(parsed, []);

    expect(result.connectors).toHaveLength(2);
    const apiNames = result.connectors.map((c) => c.apiName);
    expect(apiNames).toContain("onedriveforbusiness");
    expect(apiNames).toContain("office365");
  });

  it("should extract triggers with recurrence info", async () => {
    const parsed = await loadTestPackage();
    const [result] = analyzePackage(parsed, []);

    expect(result.triggers).toHaveLength(1);
    const trigger = result.triggers[0];
    expect(trigger.name).toBe("When_a_file_is_created_(properties_only)");
    expect(trigger.operationId).toBe("OnNewFilesV2");
    expect(trigger.connectorId).toBe("shared_onedriveforbusiness");
    expect(trigger.recurrence).toEqual({
      frequency: "Minute",
      interval: 15,
    });
  });

  it("should extract actions", async () => {
    const parsed = await loadTestPackage();
    const [result] = analyzePackage(parsed, []);

    expect(result.actions).toHaveLength(1);
    const action = result.actions[0];
    expect(action.name).toBe("Send_me_an_email_notification");
    expect(action.operationId).toBe("SendEmailV2");
    expect(action.connectorId).toBe("shared_office365");
  });

  it("should generate questions for unmatched skills", async () => {
    const parsed = await loadTestPackage();
    const [result] = analyzePackage(parsed, []);

    // With no skill definitions, all trigger/action should have questions
    const triggerQuestions = result.questions.filter(
      (q) => q.category === "trigger"
    );
    const actionQuestions = result.questions.filter(
      (q) => q.category === "action"
    );

    // Trigger: skill unknown + recurrence question
    expect(triggerQuestions.length).toBeGreaterThanOrEqual(2);
    // Action: skill unknown
    expect(actionQuestions.length).toBeGreaterThanOrEqual(1);
  });

  it("should match skills when definitions are provided", async () => {
    const parsed = await loadTestPackage();
    const [result] = analyzePackage(parsed, MATCHING_SKILLS);

    // Trigger should match OnNewFilesV2
    expect(result.triggers[0].skillMatch).not.toBeNull();
    expect(result.triggers[0].skillMatch?.businessMeaning).toBe(
      "新規ファイル検知"
    );

    // Action should match SendEmailV2
    expect(result.actions[0].skillMatch).not.toBeNull();
    expect(result.actions[0].skillMatch?.businessMeaning).toBe("メール送信");
  });

  it("should have fewer questions when skills are matched", async () => {
    const parsed = await loadTestPackage();

    const [withoutSkills] = analyzePackage(parsed, []);
    const [withSkills] = analyzePackage(parsed, MATCHING_SKILLS);

    // With skills matched, trigger/action "unknown skill" questions should be gone
    const unknownWithout = withoutSkills.questions.filter(
      (q) => q.reason.includes("スキル定義が未登録")
    );
    const unknownWith = withSkills.questions.filter(
      (q) => q.reason.includes("スキル定義が未登録")
    );

    expect(unknownWith.length).toBeLessThan(unknownWithout.length);
  });

  it("should always generate recurrence question for triggers with intervals", async () => {
    const parsed = await loadTestPackage();
    const [result] = analyzePackage(parsed, MATCHING_SKILLS);

    const recurrenceQuestions = result.questions.filter(
      (q) => q.question.includes("実行間隔")
    );
    expect(recurrenceQuestions).toHaveLength(1);
    expect(recurrenceQuestions[0].question).toContain("15");
    expect(recurrenceQuestions[0].question).toContain("Minute");
  });
});
