import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail } from "@/lib/auth";
import { pool } from "@/lib/db";

async function identify(params: Promise<{ id: string; messageId: string }>) {
  const { id, messageId } = await params;
  return { webinarId: Number(id), messageId: Number(messageId) };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  if (!(await getAdminSessionEmail())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { webinarId, messageId } = await identify(params);
  if (!Number.isInteger(webinarId) || !Number.isInteger(messageId)) return NextResponse.json({ error: "Invalid message." }, { status: 400 });
  const body = await req.json().catch(() => null) as { status?: unknown } | null;
  const status = body?.status;
  if (status !== "approved" && status !== "rejected") return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  const result = await pool.query("UPDATE webinar_comments SET status = $3 WHERE id = $1 AND webinar_id = $2 RETURNING id", [messageId, webinarId, status]);
  if (!result.rowCount) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  if (!(await getAdminSessionEmail())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { webinarId, messageId } = await identify(params);
  if (!Number.isInteger(webinarId) || !Number.isInteger(messageId)) return NextResponse.json({ error: "Invalid message." }, { status: 400 });
  const result = await pool.query("DELETE FROM webinar_comments WHERE id = $1 AND webinar_id = $2 RETURNING id", [messageId, webinarId]);
  if (!result.rowCount) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
