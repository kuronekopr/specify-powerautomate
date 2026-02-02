import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { skillDefinitions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const rows = await db.select().from(skillDefinitions);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { connectorId, actionName, businessMeaning, failureImpact, notes } =
    body as {
      connectorId?: string;
      actionName?: string;
      businessMeaning?: string;
      failureImpact?: string;
      notes?: string;
    };

  if (!connectorId || connectorId.trim().length === 0) {
    return NextResponse.json(
      { error: "connectorIdは必須です。" },
      { status: 400 },
    );
  }

  const db = getDb();

  try {
    const [created] = await db
      .insert(skillDefinitions)
      .values({
        connectorId: connectorId.trim(),
        actionName: actionName?.trim() || null,
        businessMeaning: businessMeaning?.trim() || null,
        failureImpact: failureImpact?.trim() || null,
        notes: notes?.trim() || null,
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    const code = e.code ?? e.cause?.code;
    const msg = e.message ?? "";
    if (code === "23505" || msg.includes("unique")) {
      return NextResponse.json(
        { error: "このconnectorIdは既に登録されています。" },
        { status: 409 },
      );
    }
    throw e;
  }
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id, connectorId, actionName, businessMeaning, failureImpact, notes } =
    body as {
      id?: string;
      connectorId?: string;
      actionName?: string;
      businessMeaning?: string;
      failureImpact?: string;
      notes?: string;
    };

  if (!id) {
    return NextResponse.json({ error: "idは必須です。" }, { status: 400 });
  }

  const db = getDb();
  const [updated] = await db
    .update(skillDefinitions)
    .set({
      connectorId: connectorId?.trim(),
      actionName: actionName?.trim() || null,
      businessMeaning: businessMeaning?.trim() || null,
      failureImpact: failureImpact?.trim() || null,
      notes: notes?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(skillDefinitions.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json(
      { error: "スキル定義が見つかりません。" },
      { status: 404 },
    );
  }

  return NextResponse.json(updated);
}
