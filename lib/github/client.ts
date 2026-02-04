/**
 * GitHub API client for repository, issue, and PR operations.
 * Uses raw fetch against the GitHub REST API.
 */

const GITHUB_API = "https://api.github.com";

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

async function ghFetch<T>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: { ...headers(token), ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ── Repository ───────────────────────────────────────────────────

export interface RepoInfo {
  full_name: string;
  html_url: string;
  default_branch: string;
}

export async function getOrCreateRepo(
  token: string,
  owner: string,
  repoName: string
): Promise<RepoInfo> {
  try {
    return await ghFetch<RepoInfo>(token, `/repos/${owner}/${repoName}`);
  } catch {
    // Create if not found
    return await ghFetch<RepoInfo>(token, `/user/repos`, {
      method: "POST",
      body: JSON.stringify({
        name: repoName,
        private: true,
        auto_init: true,
        description: "Power Automate 業務仕様書リポジトリ",
      }),
    });
  }
}

// ── Issue ────────────────────────────────────────────────────────

export interface IssueInfo {
  number: number;
  html_url: string;
  state: string;
}

export async function createIssue(
  token: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
  labels?: string[]
): Promise<IssueInfo> {
  return ghFetch<IssueInfo>(token, `/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body, labels: labels ?? [] }),
  });
}

export async function getIssue(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<IssueInfo> {
  return ghFetch<IssueInfo>(
    token,
    `/repos/${owner}/${repo}/issues/${issueNumber}`
  );
}

export async function getIssueComments(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<{ body: string; user: { login: string } }[]> {
  return ghFetch(
    token,
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments`
  );
}

// ── Branch & File ────────────────────────────────────────────────

interface RefInfo {
  ref: string;
  object: { sha: string };
}

export async function createBranch(
  token: string,
  owner: string,
  repo: string,
  branchName: string,
  fromBranch: string
): Promise<RefInfo> {
  const base = await ghFetch<RefInfo>(
    token,
    `/repos/${owner}/${repo}/git/ref/heads/${fromBranch}`
  );

  return ghFetch<RefInfo>(token, `/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: base.object.sha,
    }),
  });
}

interface FileCommitResult {
  content: { sha: string };
  commit: { sha: string; html_url: string };
}

export async function commitFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
  existingSha?: string
): Promise<FileCommitResult> {
  const encoded = Buffer.from(content, "utf-8").toString("base64");

  const body: Record<string, string> = {
    message,
    content: encoded,
    branch,
  };
  if (existingSha) {
    body.sha = existingSha;
  }

  return ghFetch<FileCommitResult>(
    token,
    `/repos/${owner}/${repo}/contents/${path}`,
    { method: "PUT", body: JSON.stringify(body) }
  );
}

// ── Pull Request ─────────────────────────────────────────────────

export interface PrInfo {
  number: number;
  html_url: string;
  state: string;
  merged: boolean;
}

export async function createPullRequest(
  token: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string
): Promise<PrInfo> {
  return ghFetch<PrInfo>(token, `/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({ title, body, head, base }),
  });
}

export async function getPullRequest(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PrInfo> {
  return ghFetch<PrInfo>(
    token,
    `/repos/${owner}/${repo}/pulls/${prNumber}`
  );
}

// ── Webhook ──────────────────────────────────────────────────────

export interface WebhookConfig {
  url: string;
  content_type: string;
  secret?: string;
}

export interface WebhookInfo {
  id: number;
  config: WebhookConfig;
}

export async function listRepoWebhooks(
  token: string,
  owner: string,
  repo: string
): Promise<WebhookInfo[]> {
  return ghFetch<WebhookInfo[]>(token, `/repos/${owner}/${repo}/hooks`);
}

export async function createRepoWebhook(
  token: string,
  owner: string,
  repo: string,
  webhookUrl: string,
  secret: string
): Promise<WebhookInfo> {
  return ghFetch<WebhookInfo>(token, `/repos/${owner}/${repo}/hooks`, {
    method: "POST",
    body: JSON.stringify({
      name: "web",
      active: true,
      events: ["pull_request"],
      config: {
        url: webhookUrl,
        content_type: "json",
        secret: secret,
        insecure_ssl: "0",
      },
    }),
  });
}
