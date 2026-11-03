import { NextResponse } from "next/server";
import { getAdminSessionEmail } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const adminEmail = await getAdminSessionEmail();
  if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await pool.query(`UPDATE review_requests SET status='cancelled',cancelled_at=now(),updated_at=now() WHERE id=$1 AND status='queued' RETURNING id`, [Number(id)]);
  if (!result.rowCount) return NextResponse.json({ error: "Only queued requests can be cancelled." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
