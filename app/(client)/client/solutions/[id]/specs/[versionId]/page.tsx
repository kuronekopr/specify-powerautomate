import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { specVersions, solutions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";

export default async function SpecViewerPage({
  params,
}: {
  params: Promise<{ id: string; versionId: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const { id: solutionId, versionId } = await params;
  const db = getDb();

  // Verify ownership
  const [solution] = await db
    .select()
    .from(solutions)
    .where(
      and(eq(solutions.id, solutionId), eq(solutions.userId, session.user.id)),
    )
    .limit(1);

  if (!solution) notFound();

  const [spec] = await db
    .select()
    .from(specVersions)
    .where(
      and(
        eq(specVersions.id, versionId),
        eq(specVersions.solutionId, solutionId),
      ),
    )
    .limit(1);

  if (!spec) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/client/solutions/${solutionId}`}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← {solution.name} に戻る
        </Link>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          仕様書 v{spec.versionNumber}
        </h2>
        {spec.isCurrent && (
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
            最新
          </span>
        )}
        {spec.approvedAt && (
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            承認済
          </span>
        )}
      </div>

      <div className="mb-6 flex gap-6 text-sm text-zinc-500">
        {spec.changeReason && (
          <span>変更理由: {spec.changeReason}</span>
        )}
        {spec.createdAt && (
          <span>作成日: {new Date(spec.createdAt).toLocaleString("ja-JP")}</span>
        )}
        {spec.approvedAt && (
          <span>承認日: {new Date(spec.approvedAt).toLocaleString("ja-JP")}</span>
        )}
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-700 dark:bg-zinc-900">
        <div
          className="prose prose-zinc max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{
            __html: markdownToHtml(spec.markdownContent || ""),
          }}
        />
      </div>
    </div>
  );
}

/** Simple markdown → HTML converter for spec display */
function markdownToHtml(md: string): string {
  let html = md
    // Escape HTML entities
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Code blocks
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const code = match.replace(/```\w*\n?/, "").replace(/\n?```$/, "");
    return `<pre><code>${code}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Horizontal rules
  html = html.replace(/^---$/gm, "<hr>");

  // Tables
  html = html.replace(
    /^\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/gm,
    (_match, header: string, body: string) => {
      const headers = header
        .split("|")
        .map((h: string) => h.trim())
        .filter(Boolean);
      const rows = body
        .trim()
        .split("\n")
        .map((row: string) =>
          row
            .split("|")
            .map((c: string) => c.trim())
            .filter(Boolean),
        );

      let table = '<table class="w-full"><thead><tr>';
      for (const h of headers) {
        table += `<th>${h}</th>`;
      }
      table += "</tr></thead><tbody>";
      for (const row of rows) {
        table += "<tr>";
        for (const cell of row) {
          table += `<td>${cell}</td>`;
        }
        table += "</tr>";
      }
      table += "</tbody></table>";
      return table;
    },
  );

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

  // Paragraphs: wrap remaining lines
  html = html.replace(/^(?!<[hluoptd]|<\/|<hr)(.+)$/gm, "<p>$1</p>");

  return html;
}
