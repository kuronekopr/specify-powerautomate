# 詳細実装計画書: Power Automate業務資産化プラットフォーム

## 1. システム概要
本システムは、顧客がアップロードしたPower Automateのエクスポートファイルを解析し、業務仕様書を自動生成・管理するWebプラットフォームである。
生成エンジンは非公開の「スキル定義」に基づき動作し、成果物（仕様書）の履歴を管理することで業務の資産化を実現する。

**コアコンセプト**:
- 「仕様書は結果、Diffは意思決定ログ」
- GitHubを「業務知識の履歴データベース」かつ「承認ワークフロー基盤」として活用

---

## 2. 技術スタック

| レイヤー | 技術 | 用途 |
|---------|-----|------|
| Frontend/Backend | Next.js (App Router) | UIとAPI |
| Platform | Vercel | ホスティング |
| Database | Neon (PostgreSQL) | ユーザー・ソルーション・進捗管理 |
| Object Storage | Vercel Blob | アップロードファイル保存 |
| Auth | Auth.js (NextAuth) | 認証 |
| Async Queue | Inngest | 長時間処理・ステップ実行 |
| Version Control & Workflow | GitHub API | 仕様書管理、Issue（質問）、PR（承認） |
| Email | Resend | 通知メール送信 |
| PDF出力 | @react-pdf/renderer または html-pdf-node (Edge対応版) | 仕様書PDF化 |

---

## 3. ユーザーペルソナと権限

| ロール | できること |
|--------|-----------|
| **Client (顧客)** | ログイン、ファイルアップロード、GitHub Issue（質問）への回答、PR承認、仕様書閲覧・DL |
| **Admin (提供者)** | 顧客管理、ドラフトレビュー・編集、Issue作成、PR作成、スキル定義メンテナンス |

---

## 4. データベース設計 (Neon)

```sql
-- ユーザー
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  company_name VARCHAR(255),
  github_username VARCHAR(255), -- PRレビュー用
  role VARCHAR(50) DEFAULT 'client', -- 'admin', 'client'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ソルーション（業務単位）
CREATE TABLE solutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  github_repo_name VARCHAR(255), -- "pa-spec-{company}-{solution}"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- アップロード履歴
CREATE TABLE uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solution_id UUID REFERENCES solutions(id),
  file_url TEXT, -- Blob URL
  status VARCHAR(50) DEFAULT 'pending',
    -- 'pending' → 'analyzing' → 'questions_open' → 'drafting' 
    -- → 'pr_open' → 'approved' → 'completed' / 'failed'
  github_issue_number INT, -- 質問用Issue番号
  github_pr_number INT, -- 承認用PR番号
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 仕様書バージョン
CREATE TABLE spec_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solution_id UUID REFERENCES solutions(id),
  upload_id UUID REFERENCES uploads(id),
  version_number INT,
  markdown_content TEXT,
  change_reason TEXT, -- 管理者が記入する「なぜ変更したか」
  github_commit_sha VARCHAR(40),
  is_current BOOLEAN DEFAULT FALSE,
  approved_by UUID REFERENCES users(id), -- 承認した顧客
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- スキル定義マスタ（知的資産）
CREATE TABLE skill_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id VARCHAR(255) UNIQUE NOT NULL, -- e.g., "shared_office365", "shared_sharepoint"
  action_name VARCHAR(255), -- e.g., "SendEmailV2"
  business_meaning TEXT, -- 業務上の意味
  failure_impact TEXT, -- 失敗時に何が起きるか
  notes TEXT, -- 業務的な注意点
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 5. 非同期ワークフロー (Inngest)

### 全体フロー図

```
[顧客] ファイルアップロード
         ↓
   ┌─────────────────────────────────────────┐
   │  Step 1: Setup                          │
   │  - ZIP解凍、GitHubリポジトリ確認/作成    │
   └─────────────────────────────────────────┘
         ↓
   ┌─────────────────────────────────────────┐
   │  Step 2: Analysis (Claude Works Engine) │
   │  - フロー構造解析                        │
   │  - スキル定義マッピング                  │
   │  - 不明点・曖昧点の抽出                  │
   └─────────────────────────────────────────┘
         ↓
   ┌─────────────────────────────────────────┐
   │  Step 3: Create GitHub Issue (質問)     │
   │  - 設計意図確認用の質問リストをIssueに   │
   │  - 顧客にメール通知 (Resend)             │
   │  - ステータス: questions_open            │
   └─────────────────────────────────────────┘
         ↓
   ┌─────────────────────────────────────────┐
   │  ** 待機: Issue Close イベント **       │
   │  waitForEvent("github.issue.closed")    │
   └─────────────────────────────────────────┘
         ↓ (顧客がIssueに回答し、管理者がClose)
   ┌─────────────────────────────────────────┐
   │  Step 4: Draft Generation (LLM)         │
   │  - 回答を反映し、仕様書Markdownを生成    │
   │  - 管理者がレビュー・編集                │
   └─────────────────────────────────────────┘
         ↓
   ┌─────────────────────────────────────────┐
   │  Step 5: Create GitHub PR (承認依頼)    │
   │  - 仕様書をブランチにコミット            │
   │  - PRを作成し、顧客をReviewerに追加      │
   │  - 顧客にメール通知 (Resend)             │
   │  - ステータス: pr_open                   │
   └─────────────────────────────────────────┘
         ↓
   ┌─────────────────────────────────────────┐
   │  ** 待機: PR Merge イベント **          │
   │  waitForEvent("github.pr.merged")       │
   └─────────────────────────────────────────┘
         ↓ (顧客がPR Approve → 管理者がMerge)
   ┌─────────────────────────────────────────┐
   │  Step 6: Finalize                       │
   │  - spec_versions に保存                  │
   │  - is_current = true に更新              │
   │  - 顧客に完了メール (Resend)             │
   │  - ステータス: completed                 │
   └─────────────────────────────────────────┘
```

### GitHub Webhookの設定
- リポジトリに対して `issues` と `pull_request` のWebhookを設定。
- Vercel API (`/api/github/webhook`) で受け取り、Inngestイベントを発火。

---

## 6. 機能要件詳細

### 6.1 管理者機能 (Admin Dashboard)

| 画面 | 機能 |
|------|------|
| **ダッシュボード** | 全顧客のアップロード一覧、ステータス確認 |
| **ドラフトエディタ** | AIが生成したMarkdownをプレビュー・編集 |
| **変更理由入力** | 「なぜこの変更をしたか」を記録するフォーム |
| **Issue管理ビュー** | 顧客からの回答状況を確認、Closeトリガー |
| **スキル定義エディタ** | `skill_definitions` テーブルの編集UI |

### 6.2 顧客機能 (Client Dashboard)

| 画面 | 機能 |
|------|------|
| **ソルーション一覧** | 自分のソルーションを選択 |
| **アップロード** | ZIPファイルをD&D、進捗表示 |
| **質問回答 (Issue)** | GitHub Issueへのリンク、またはアプリ内で回答フォーム表示 |
| **承認 (PR)** | GitHub PRへのリンク、またはアプリ内で差分プレビュー＆承認ボタン |
| **仕様書ビューアー** | 最新版Markdown表示、履歴切り替え |
| **ダウンロード** | PDF / Markdown ダウンロード |

---

## 7. フォルダ構成 (Next.js App Router)

```
/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── register/
│   ├── (admin)/
│   │   ├── dashboard/
│   │   ├── review/[uploadId]/   # ドラフトエディタ
│   │   └── skills/              # スキル定義管理
│   ├── (client)/
│   │   ├── dashboard/
│   │   └── solution/[id]/
│   │       ├── upload/
│   │       ├── questions/       # Issue回答
│   │       ├── approve/         # PR承認
│   │       └── viewer/
│   ├── api/
│   │   ├── inngest/             # ワーカー
│   │   ├── github/
│   │   │   └── webhook/         # GitHub Webhook受信
│   │   ├── upload/
│   │   └── resend/              # メール送信
├── lib/
│   ├── db/                      # Drizzle ORM
│   ├── analysis/                # [CORE] 解析エンジン
│   ├── llm/                     # プロンプト
│   ├── github/                  # GitHub API Utils
│   └── resend/                  # Resend Utils
├── inngest/
│   └── workflows/
│       └── process-spec.ts      # メインワークフロー
└── drizzle/                     # マイグレーション
```

---

## 8. 実装フェーズ

### Phase 1: 基盤構築 (Foundation)
1. Next.js + Neon + Auth.js セットアップ
2. Drizzle ORM でスキーマ定義・マイグレーション
3. Vercel Blob 設定
4. GitHub App 作成（リポジトリ操作用）

### Phase 2: コアエンジン (Analysis)
1. Power Automate ZIP パーサー実装
2. `skill_definitions` テーブルへの初期データ投入
3. 構造解析 → スキルマッピング → 質問リスト生成 のパイプライン

### Phase 3: ワークフロー (Inngest + GitHub)
1. Inngest セットアップ
2. Step 1-3 実装（アップロード → Issue作成）
3. GitHub Webhook → Inngest イベント連携
4. Step 4-6 実装（ドラフト → PR → Finalize）

### Phase 4: メール通知 (Resend)
1. Resend SDK 設定
2. 通知テンプレート作成（質問依頼、承認依頼、完了通知）

### Phase 5: UI実装
1. 管理者ダッシュボード・ドラフトエディタ
2. 顧客ダッシュボード・ビューアー
3. PDF出力機能

---

## 9. 成功条件 (Acceptance Criteria)

要求定義書に基づき、以下が満たされていること：

- [ ] 第三者が仕様書を読んで「この業務が何をしているか」を説明できる
- [ ] 設計者がいなくても業務の判断構造が理解できる
- [ ] 変更履歴（いつ・何が・なぜ）が追跡できる
- [ ] 「止まったら誰も分からない」状態が解消されている
- [ ] 顧客はGitHub操作を直接行わなくてよい（UIで完結）
- [ ] スキル定義・解析ロジックは顧客に非公開

---

## 10. 補足: 知財保護

- `lib/analysis/` 配下のコードは**顧客には一切公開しない**。
- GitHubリポジトリには**仕様書（Markdown）のみ**を格納。
- スキル定義はNeon DBで管理し、顧客からはアクセス不可。
