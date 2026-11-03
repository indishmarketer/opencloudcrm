import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const commentId = Number((await params).id);
  if (!Number.isInteger(commentId)) return NextResponse.json({ error: "Invalid comment." }, { status: 400 });

  // Replies cascade through the parent_comment_id foreign key.
  const result = await pool.query("DELETE FROM course_comments WHERE id = $1", [commentId]);
  if (result.rowCount !== 1) return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
