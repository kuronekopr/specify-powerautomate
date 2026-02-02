import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const { email, password, name, companyName } = await req.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "メールアドレスとパスワードは必須です。" },
      { status: 400 }
    );
  }

  const db = getDb();

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "このメールアドレスは既に登録されています。" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.insert(users).values({
    email,
    passwordHash,
    name: name || null,
    companyName: companyName || null,
    role: "client",
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
