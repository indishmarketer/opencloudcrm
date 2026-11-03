import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; scheduleId: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, scheduleId } = await params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(scheduleId)) {
    return NextResponse.json({ error: "Invalid scheduled email." }, { status: 400 });
  }
  const result = await pool.query(
    `UPDATE contact_email_scheduled SET status = 'cancelled'
     WHERE id = $1 AND contact_id = $2 AND status = 'pending' AND scheduled_at > now()
     RETURNING id`,
    [Number(scheduleId), Number(id)],
  );
  if (!result.rowCount) return NextResponse.json({ error: "This email is no longer pending and cannot be cancelled." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
