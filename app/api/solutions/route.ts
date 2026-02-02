import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { solutions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(solutions)
    .where(eq(solutions.userId, session.user.id));

  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, description } = body as {
    name?: string;
    description?: string;
  };

  if (!name || name.trim().length === 0) {
    return NextResponse.json(
      { error: "ソリューション名は必須です。" },
      { status: 400 },
    );
  }

  const db = getDb();
  const [created] = await db
    .insert(solutions)
    .values({
      userId: session.user.id,
      name: name.trim(),
      description: description?.trim() || null,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
