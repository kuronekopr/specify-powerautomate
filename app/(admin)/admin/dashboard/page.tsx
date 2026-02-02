import { getDb } from "@/lib/db";
import { uploads, solutions, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "待機中", color: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  analyzing: { label: "分析中", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  questions_open: { label: "質問中", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
  pr_open: { label: "PR作成済", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  drafting: { label: "仕様書作成中", color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
  completed: { label: "完了", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
};

export default async function AdminDashboardPage() {
  const db = getDb();

  const rows = await db
    .select({
      id: uploads.id,
      status: uploads.status,
      githubIssueNumber: uploads.githubIssueNumber,
      githubPrNumber: uploads.githubPrNumber,
      createdAt: uploads.createdAt,
      solutionName: solutions.name,
      userName: users.name,
      userEmail: users.email,
    })
    .from(uploads)
    .leftJoin(solutions, eq(uploads.solutionId, solutions.id))
    .leftJoin(users, eq(solutions.userId, users.id))
    .orderBy(desc(uploads.createdAt));

  return (
    <div>
      <h2 className="mb-6 text-xl font-bold text-zinc-900 dark:text-zinc-100">
        ダッシュボード
      </h2>

      {rows.length === 0 ? (
        <p className="text-zinc-500">アップロードはまだありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="pb-3 pr-4 font-medium text-zinc-500 dark:text-zinc-400">ユーザー</th>
                <th className="pb-3 pr-4 font-medium text-zinc-500 dark:text-zinc-400">ソリューション</th>
                <th className="pb-3 pr-4 font-medium text-zinc-500 dark:text-zinc-400">ステータス</th>
                <th className="pb-3 pr-4 font-medium text-zinc-500 dark:text-zinc-400">Issue</th>
                <th className="pb-3 pr-4 font-medium text-zinc-500 dark:text-zinc-400">PR</th>
                <th className="pb-3 font-medium text-zinc-500 dark:text-zinc-400">日時</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const status = statusConfig[row.status] ?? {
                  label: row.status,
                  color: "bg-zinc-100 text-zinc-700",
                };
                return (
                  <tr
                    key={row.id}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="py-3 pr-4 text-zinc-900 dark:text-zinc-100">
                      {row.userName || row.userEmail || "—"}
                    </td>
                    <td className="py-3 pr-4 text-zinc-900 dark:text-zinc-100">
                      {row.solutionName || "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${status.color}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                      {row.githubIssueNumber ? `#${row.githubIssueNumber}` : "—"}
                    </td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                      {row.githubPrNumber ? `#${row.githubPrNumber}` : "—"}
                    </td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">
                      {row.createdAt
                        ? new Date(row.createdAt).toLocaleString("ja-JP")
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
  );
}
