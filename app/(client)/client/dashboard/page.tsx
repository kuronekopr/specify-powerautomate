import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { solutions, uploads, specVersions } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import Link from "next/link";

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "待機中", color: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  analyzing: { label: "分析中", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  questions_open: { label: "質問中", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
  pr_open: { label: "PR作成済", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  drafting: { label: "仕様書作成中", color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
  completed: { label: "完了", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
};

export default async function ClientDashboardPage() {
  const session = await auth();
  if (!session?.user) return null;

  const db = getDb();

  const userSolutions = await db
    .select()
    .from(solutions)
    .where(eq(solutions.userId, session.user.id))
    .orderBy(desc(solutions.createdAt));

  // Fetch uploads and current specs for each solution
  const solutionData = await Promise.all(
    userSolutions.map(async (sol) => {
      const solUploads = await db
        .select()
        .from(uploads)
        .where(eq(uploads.solutionId, sol.id))
        .orderBy(desc(uploads.createdAt));

      const [currentSpec] = await db
        .select()
        .from(specVersions)
        .where(
          and(
            eq(specVersions.solutionId, sol.id),
            eq(specVersions.isCurrent, true),
          ),
        )
        .limit(1);

      return { solution: sol, uploads: solUploads, currentSpec };
    }),
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          マイダッシュボード
        </h2>
        <Link
          href="/client/solutions/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          新規ソリューション
        </Link>
      </div>

      {solutionData.length === 0 ? (
        <p className="text-zinc-500">
          ソリューションはまだ登録されていません。
        </p>
      ) : (
        <div className="space-y-6">
          {solutionData.map(({ solution, uploads: solUploads, currentSpec }) => (
            <div
              key={solution.id}
              className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <Link
                    href={`/client/solutions/${solution.id}`}
                    className="text-lg font-semibold text-zinc-900 hover:underline dark:text-zinc-100"
                  >
                    {solution.name}
                  </Link>
                  {solution.description && (
                    <p className="mt-1 text-sm text-zinc-500">
                      {solution.description}
                    </p>
                  )}
                </div>
                {currentSpec && (
                  <Link
                    href={`/client/solutions/${solution.id}/specs/${currentSpec.id}`}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    最新仕様書 v{currentSpec.versionNumber}
                  </Link>
                )}
              </div>

              {solUploads.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-700">
                        <th className="pb-2 pr-4 text-xs font-medium text-zinc-500">ステータス</th>
                        <th className="pb-2 pr-4 text-xs font-medium text-zinc-500">Issue</th>
                        <th className="pb-2 pr-4 text-xs font-medium text-zinc-500">PR</th>
                        <th className="pb-2 text-xs font-medium text-zinc-500">日時</th>
                      </tr>
                    </thead>
                    <tbody>
                      {solUploads.slice(0, 3).map((upload) => {
                        const status = statusConfig[upload.status] ?? {
                          label: upload.status,
                          color: "bg-zinc-100 text-zinc-700",
                        };
                        return (
                          <tr key={upload.id} className="border-b border-zinc-50 dark:border-zinc-800">
                            <td className="py-2 pr-4">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}>
                                {status.label}
                              </span>
                            </td>
                            <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400 text-xs">
                              {upload.githubIssueNumber ? `#${upload.githubIssueNumber}` : "—"}
                            </td>
                            <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400 text-xs">
                              {upload.githubPrNumber ? `#${upload.githubPrNumber}` : "—"}
                            </td>
                            <td className="py-2 text-zinc-600 dark:text-zinc-400 text-xs">
                              {upload.createdAt
                                ? new Date(upload.createdAt).toLocaleString("ja-JP")
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {solUploads.length > 3 && (
                    <Link
                      href={`/client/solutions/${solution.id}`}
                      className="mt-2 inline-block text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    >
                      他 {solUploads.length - 3} 件を表示 →
                    </Link>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
