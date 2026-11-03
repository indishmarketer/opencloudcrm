import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const noteId = Number(id);
  if (!Number.isInteger(noteId)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  await pool.query("DELETE FROM contact_notes WHERE id = $1", [noteId]);
  return NextResponse.json({ ok: true });
}
