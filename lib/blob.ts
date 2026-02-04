import { put, del } from "@vercel/blob";

/**
 * ファイル名にタイムスタンプを付与する
 * 例: file.zip → file_20260204123456.zip
 */
export function addTimestampToFilename(filename: string): string {
  const now = new Date();
  const timestamp =
    now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, "0") +
    now.getDate().toString().padStart(2, "0") +
    now.getHours().toString().padStart(2, "0") +
    now.getMinutes().toString().padStart(2, "0") +
    now.getSeconds().toString().padStart(2, "0");

  const lastDotIndex = filename.lastIndexOf(".");
  if (lastDotIndex === -1) {
    return `${filename}_${timestamp}`;
  }
  const name = filename.slice(0, lastDotIndex);
  const ext = filename.slice(lastDotIndex);
  return `${name}_${timestamp}${ext}`;
}

export async function uploadFile(file: File, folder: string) {
  const timestampedName = addTimestampToFilename(file.name);
  const blob = await put(`${folder}/${timestampedName}`, file, {
    access: "public",
  });
  return blob;
}

export async function deleteFile(url: string) {
  await del(url);
}
