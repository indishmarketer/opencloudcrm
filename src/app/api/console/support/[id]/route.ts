import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  // ON DELETE CASCADE on contact_submission_replies removes every reply to
  // this message too -- nothing orphaned left behind.
  const result = await pool.query("DELETE FROM contact_submissions WHERE id = $1 RETURNING id", [id]);
  if (!result.rowCount) return NextResponse.json({ error: "Message not found." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
