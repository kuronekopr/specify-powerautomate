import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const FROM_ADDRESS =
  process.env.EMAIL_FROM ?? "noreply@specify-powerautomate.com";

export interface SendEmailResult {
  id: string;
}

// ── 1. 質問依頼メール (Issue 作成時) ────────────────────────────

export async function sendQuestionRequestEmail(params: {
  to: string;
  packageName: string;
  issueUrl: string;
  questionCount: number;
}): Promise<SendEmailResult> {
  const resend = getResend();

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject: `[確認依頼] ${params.packageName} の設計確認事項`,
    html: buildQuestionRequestHtml(params),
  });

  if (error) throw new Error(`Email send failed: ${error.message}`);
  return { id: data!.id };
}

function buildQuestionRequestHtml(params: {
  packageName: string;
  issueUrl: string;
  questionCount: number;
}): string {
  return `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>設計確認のお願い</h2>
  <p>お疲れ様です。</p>
  <p>アップロードいただいた Power Automate フロー <strong>${escape(params.packageName)}</strong> の分析が完了しました。</p>
  <p>設計意図の確認が必要な事項が <strong>${params.questionCount} 件</strong> あります。</p>
  <p>以下の GitHub Issue にて回答をお願いいたします。</p>
  <p style="margin: 24px 0;">
    <a href="${escape(params.issueUrl)}"
       style="background: #0969da; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
      Issue を確認する
    </a>
  </p>
  <p style="color: #666; font-size: 14px;">回答完了後、Issue を Close してください。自動的に仕様書ドラフトの生成が開始されます。</p>
</div>`.trim();
}

// ── 2. 承認依頼メール (PR 作成時) ────────────────────────────────

export async function sendApprovalRequestEmail(params: {
  to: string;
  packageName: string;
  prUrl: string;
  version: number;
}): Promise<SendEmailResult> {
  const resend = getResend();

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject: `[承認依頼] ${params.packageName} 仕様書 v${params.version}`,
    html: buildApprovalRequestHtml(params),
  });

  if (error) throw new Error(`Email send failed: ${error.message}`);
  return { id: data!.id };
}

function buildApprovalRequestHtml(params: {
  packageName: string;
  prUrl: string;
  version: number;
}): string {
  return `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>仕様書レビューのお願い</h2>
  <p>お疲れ様です。</p>
  <p><strong>${escape(params.packageName)}</strong> の仕様書ドラフト (v${params.version}) が作成されました。</p>
  <p>以下の Pull Request にて内容をご確認のうえ、マージをお願いいたします。</p>
  <p style="margin: 24px 0;">
    <a href="${escape(params.prUrl)}"
       style="background: #1a7f37; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
      Pull Request を確認する
    </a>
  </p>
  <p style="color: #666; font-size: 14px;">マージ後、仕様書が正式版として登録されます。</p>
</div>`.trim();
}

// ── 3. 完了通知メール (Finalize 時) ──────────────────────────────

export async function sendCompletionEmail(params: {
  to: string;
  packageName: string;
  version: number;
  repoUrl: string;
}): Promise<SendEmailResult> {
  const resend = getResend();

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject: `[完了] ${params.packageName} 仕様書 v${params.version} が登録されました`,
    html: buildCompletionHtml(params),
  });

  if (error) throw new Error(`Email send failed: ${error.message}`);
  return { id: data!.id };
}

function buildCompletionHtml(params: {
  packageName: string;
  version: number;
  repoUrl: string;
}): string {
  return `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>仕様書登録完了</h2>
  <p>お疲れ様です。</p>
  <p><strong>${escape(params.packageName)}</strong> の仕様書 v${params.version} が正式に登録されました。</p>
  <p>GitHub リポジトリにて仕様書の全履歴を確認できます。</p>
  <p style="margin: 24px 0;">
    <a href="${escape(params.repoUrl)}"
       style="background: #8250df; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
      リポジトリを確認する
    </a>
  </p>
  <p style="color: #666; font-size: 14px;">本メールは自動送信です。ご不明点がございましたらお問い合わせください。</p>
</div>`.trim();
}

// ── Utility ──────────────────────────────────────────────────────

function escape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
