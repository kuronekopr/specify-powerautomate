import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { solutions, uploads, specVersions } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import UploadForm from "./upload-form";

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "待機中", color: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  analyzing: { label: "分析中", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  questions_open: { label: "質問中", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
  pr_open: { label: "PR作成済", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  drafting: { label: "仕様書作成中", color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
  completed: { label: "完了", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
};

export default async function SolutionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const { id } = await params;
  const db = getDb();

  const [solution] = await db
    .select()
    .from(solutions)
    .where(
      and(eq(solutions.id, id), eq(solutions.userId, session.user.id)),
    )
    .limit(1);

  if (!solution) notFound();

  const solUploads = await db
    .select()
    .from(uploads)
    .where(eq(uploads.solutionId, solution.id))
    .orderBy(desc(uploads.createdAt));

  const specs = await db
    .select()
    .from(specVersions)
    .where(eq(specVersions.solutionId, solution.id))
    .orderBy(desc(specVersions.versionNumber));

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/client/dashboard"
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← ダッシュボードに戻る
        </Link>
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          {solution.name}
        </h2>
        {solution.description && (
          <p className="mt-1 text-sm text-zinc-500">{solution.description}</p>
        )}
      </div>

      {/* Upload form */}
      <div className="mb-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="mb-4 text-lg font-semibold text-zinc-800 dark:text-zinc-200">
          ZIPファイルアップロード
        </h3>
        <UploadForm solutionId={solution.id} />
      </div>

      {/* Spec versions */}
      {specs.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-4 text-lg font-semibold text-zinc-800 dark:text-zinc-200">
            仕様書バージョン
          </h3>
          <div className="space-y-2">
            {specs.map((spec) => (
              <div
                key={spec.id}
                className="flex items-center justify-between rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-700"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    v{spec.versionNumber}
                  </span>
                  {spec.isCurrent && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                      最新
                    </span>
                  )}
                  {spec.approvedAt && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      承認済
                    </span>
                  )}
                  <span className="text-xs text-zinc-500">
                    {spec.changeReason}
                  </span>
                </div>
                <Link
                  href={`/client/solutions/${solution.id}/specs/${spec.id}`}
                  className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  表示 →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload history */}
      <div>
        <h3 className="mb-4 text-lg font-semibold text-zinc-800 dark:text-zinc-200">
          アップロード履歴
        </h3>
        {solUploads.length === 0 ? (
          <p className="text-sm text-zinc-500">
            まだアップロードはありません。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="pb-3 pr-4 font-medium text-zinc-500 dark:text-zinc-400">ステータス</th>
                  <th className="pb-3 pr-4 font-medium text-zinc-500 dark:text-zinc-400">Issue</th>
                  <th className="pb-3 pr-4 font-medium text-zinc-500 dark:text-zinc-400">PR</th>
                  <th className="pb-3 font-medium text-zinc-500 dark:text-zinc-400">日時</th>
                </tr>
              </thead>
              <tbody>
                {solUploads.map((upload) => {
                  const status = statusConfig[upload.status] ?? {
                    label: upload.status,
                    color: "bg-zinc-100 text-zinc-700",
                  };
                  return (
                    <tr
                      key={upload.id}
                      className="border-b border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="py-3 pr-4">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                        {upload.githubIssueNumber ? `#${upload.githubIssueNumber}` : "—"}
                      </td>
                      <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                        {upload.githubPrNumber ? `#${upload.githubPrNumber}` : "—"}
                      </td>
                      <td className="py-3 text-zinc-600 dark:text-zinc-400">
                        {upload.createdAt
                          ? new Date(upload.createdAt).toLocaleString("ja-JP")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
