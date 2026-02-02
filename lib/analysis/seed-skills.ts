import { getDb } from "@/lib/db";
import { skillDefinitions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/** Known Power Automate connectors and their common operations. */
const SEED_DATA = [
  // OneDrive for Business
  {
    connectorId: "shared_onedriveforbusiness",
    actionName: null,
    businessMeaning: "OneDrive for Business ファイル操作",
    failureImpact: "ファイルの読み書きが停止し、関連する業務処理が中断される",
  },
  {
    connectorId: "shared_onedriveforbusiness",
    actionName: "OnNewFilesV2",
    businessMeaning: "OneDrive フォルダへの新規ファイルアップロードを検知する",
    failureImpact: "新規ファイルの検知が遅延または停止し、後続の通知・処理が実行されない",
  },
  {
    connectorId: "shared_onedriveforbusiness",
    actionName: "GetFileContent",
    businessMeaning: "OneDrive からファイルの内容を取得する",
    failureImpact: "ファイル内容の取得に失敗し、データ処理が中断される",
  },
  {
    connectorId: "shared_onedriveforbusiness",
    actionName: "CreateFile",
    businessMeaning: "OneDrive にファイルを新規作成する",
    failureImpact: "ファイル作成に失敗し、出力データが保存されない",
  },
  // Office 365 Outlook
  {
    connectorId: "shared_office365",
    actionName: null,
    businessMeaning: "Office 365 Outlook メール操作",
    failureImpact: "メールの送受信処理が停止し、通知やコミュニケーションが中断される",
  },
  {
    connectorId: "shared_office365",
    actionName: "SendEmailV2",
    businessMeaning: "Office 365 Outlook でメールを送信する",
    failureImpact: "メール通知が送信されず、関係者への情報伝達が遅延する",
  },
  {
    connectorId: "shared_office365",
    actionName: "OnNewEmail",
    businessMeaning: "新しいメールの受信をトリガーとして検知する",
    failureImpact: "メール受信の検知が停止し、メール起点の業務処理が実行されない",
  },
  // SharePoint
  {
    connectorId: "shared_sharepointonline",
    actionName: null,
    businessMeaning: "SharePoint Online リスト・ライブラリ操作",
    failureImpact: "SharePoint データの読み書きが停止し、チーム間の情報共有が中断される",
  },
  {
    connectorId: "shared_sharepointonline",
    actionName: "GetItems",
    businessMeaning: "SharePoint リストからアイテムを取得する",
    failureImpact: "リストデータの取得に失敗し、後続の処理が中断される",
  },
  {
    connectorId: "shared_sharepointonline",
    actionName: "PostItem",
    businessMeaning: "SharePoint リストに新しいアイテムを追加する",
    failureImpact: "リストへのデータ登録が失敗し、業務記録が欠損する",
  },
  // Teams
  {
    connectorId: "shared_teams",
    actionName: null,
    businessMeaning: "Microsoft Teams メッセージ・通知操作",
    failureImpact: "Teams への通知が停止し、チーム内のリアルタイム連携が中断される",
  },
  {
    connectorId: "shared_teams",
    actionName: "PostMessageToChannel",
    businessMeaning: "Teams チャネルにメッセージを投稿する",
    failureImpact: "チャネルへの通知が失敗し、チームメンバーへの情報共有が遅延する",
  },
  // Approvals
  {
    connectorId: "shared_approvals",
    actionName: null,
    businessMeaning: "承認ワークフロー処理",
    failureImpact: "承認リクエストの送信・管理が停止し、承認プロセスが滞留する",
  },
  {
    connectorId: "shared_approvals",
    actionName: "CreateAnApproval",
    businessMeaning: "承認リクエストを作成して承認者に送信する",
    failureImpact: "承認リクエストが送信されず、承認待ちの業務が停滞する",
  },
  {
    connectorId: "shared_approvals",
    actionName: "WaitForAnApproval",
    businessMeaning: "承認結果を待機する",
    failureImpact: "承認結果の取得に失敗し、後続の承認後処理が実行されない",
  },
] as const;

/**
 * Seed skill_definitions table with known connectors.
 * Uses upsert (ON CONFLICT DO NOTHING) to avoid duplicates when
 * connectorId alone is the unique key. For action-level entries,
 * we check existence before inserting.
 */
export async function seedSkillDefinitions() {
  const db = getDb();
  let inserted = 0;

  for (const seed of SEED_DATA) {
    // Build a unique lookup key: connectorId + actionName
    const existing = await db
      .select({ id: skillDefinitions.id })
      .from(skillDefinitions)
      .where(eq(skillDefinitions.connectorId, buildConnectorKey(seed)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(skillDefinitions).values({
        connectorId: buildConnectorKey(seed),
        actionName: seed.actionName,
        businessMeaning: seed.businessMeaning,
        failureImpact: seed.failureImpact,
      });
      inserted++;
    }
  }

  return { total: SEED_DATA.length, inserted };
}

/**
 * Build a unique connector key. For connector-level entries use the connectorId
 * directly. For action-level entries, combine connectorId and actionName.
 */
function buildConnectorKey(seed: { connectorId: string; actionName: string | null }): string {
  return seed.actionName
    ? `${seed.connectorId}/${seed.actionName}`
    : seed.connectorId;
}

export { SEED_DATA };
