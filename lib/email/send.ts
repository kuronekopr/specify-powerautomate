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
