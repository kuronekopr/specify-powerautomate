"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";

export default function UploadForm({ solutionId }: { solutionId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setProgress(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const file = form.get("file") as File | null;

    if (!file || file.size === 0) {
      setError("ファイルを選択してください。");
      setLoading(false);
      return;
    }

    try {
      setProgress("アップロード中...");

      // File streams directly from browser → Vercel Blob.
      // The handleUploadUrl callback route handles auth, DB record
      // creation, and Inngest event firing.
      await upload(file.name, file, {
        access: "public",
        handleUploadUrl: `/api/solutions/${solutionId}/upload`,
      });

      formRef.current?.reset();
      setProgress(null);
      router.refresh();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "アップロードに失敗しました。";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {progress && (
        <p className="text-sm text-blue-600 dark:text-blue-400">{progress}</p>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Power Automate ZIPファイル
        </label>
        <input
          name="file"
          type="file"
          accept=".zip"
          required
          className="w-full text-sm text-zinc-600 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 dark:text-zinc-400 dark:file:bg-zinc-700 dark:file:text-zinc-300 dark:hover:file:bg-zinc-600"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {loading ? "アップロード中..." : "アップロード"}
      </button>
    </form>
  );
}
