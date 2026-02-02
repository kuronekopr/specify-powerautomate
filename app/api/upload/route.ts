import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadFile } from "@/lib/blob";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json(
      { error: "ファイルが選択されていません。" },
      { status: 400 }
    );
  }

  const blob = await uploadFile(file, `uploads/${session.user.id}`);

  return NextResponse.json({ url: blob.url });
}
