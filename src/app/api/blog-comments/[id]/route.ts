import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { isModeratorOrAdmin } from "@/lib/community";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const commentId = Number(id);
  if (!Number.isInteger(commentId)) return NextResponse.json({ error: "Invalid comment." }, { status: 400 });

  const result = await pool.query("SELECT user_id FROM blog_comments WHERE id = $1", [commentId]);
  const comment = result.rows[0];
  if (!comment) return NextResponse.json({ error: "Comment not found." }, { status: 404 });

  const canDelete = comment.user_id === session.userId || (await isModeratorOrAdmin(session.userId));
  if (!canDelete) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  await pool.query("DELETE FROM blog_comments WHERE id = $1", [commentId]);
  return NextResponse.json({ ok: true });
}
