import { getDb } from "@/lib/db";
import { skillDefinitions } from "@/lib/db/schema";
import SkillForm from "./skill-form";

export default async function AdminSkillsPage() {
  const db = getDb();
  const skills = await db.select().from(skillDefinitions);

  return (
    <div>
      <h2 className="mb-6 text-xl font-bold text-zinc-900 dark:text-zinc-100">
        スキル定義管理
      </h2>

      <div className="mb-8">
        <h3 className="mb-4 text-lg font-semibold text-zinc-800 dark:text-zinc-200">
          新規追加
        </h3>
        <SkillForm />
      </div>

      {skills.length === 0 ? (
        <p className="text-zinc-500">スキル定義はまだ登録されていません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="pb-3 pr-4 font-medium text-zinc-500 dark:text-zinc-400">Connector ID</th>
                <th className="pb-3 pr-4 font-medium text-zinc-500 dark:text-zinc-400">アクション名</th>
                <th className="pb-3 pr-4 font-medium text-zinc-500 dark:text-zinc-400">業務上の意味</th>
                <th className="pb-3 pr-4 font-medium text-zinc-500 dark:text-zinc-400">障害影響</th>
                <th className="pb-3 font-medium text-zinc-500 dark:text-zinc-400">更新日時</th>
              </tr>
            </thead>
            <tbody>
              {skills.map((skill) => (
                <tr
                  key={skill.id}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="py-3 pr-4 font-mono text-xs text-zinc-900 dark:text-zinc-100">
                    {skill.connectorId}
                  </td>
                  <td className="py-3 pr-4 text-zinc-900 dark:text-zinc-100">
                    {skill.actionName || "—"}
                  </td>
                  <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                    {skill.businessMeaning || "—"}
                  </td>
                  <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                    {skill.failureImpact || "—"}
                  </td>
                  <td className="py-3 text-zinc-600 dark:text-zinc-400">
                    {skill.updatedAt
                      ? new Date(skill.updatedAt).toLocaleString("ja-JP")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
