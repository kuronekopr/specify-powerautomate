import NewSolutionForm from "./new-solution-form";

export default function NewSolutionPage() {
  return (
    <div>
      <h2 className="mb-6 text-xl font-bold text-zinc-900 dark:text-zinc-100">
        新規ソリューション作成
      </h2>
      <NewSolutionForm />
    </div>
  );
}
