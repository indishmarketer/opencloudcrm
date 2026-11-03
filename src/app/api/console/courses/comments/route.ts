import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createCourseComment } from "@/lib/courseComments";

/** Reply to a lesson comment from the console. The reply is posted as the
 * site account that shares the console admin's email, so it shows up on the
 * lesson with that person's name (and the Creator badge for the owner). */
export async function POST(req: NextRequest) {
  const adminEmail = await getAdminSessionEmail();
  if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { parentCommentId, body } = await req.json().catch(() => ({}));
  const parentId = Number(parentCommentId);
  if (!Number.isInteger(parentId)) return NextResponse.json({ error: "Invalid comment." }, { status: 400 });
  if (typeof body !== "string" || !body.trim()) {
    return NextResponse.json({ error: "Reply can't be empty." }, { status: 400 });
  }

  const userResult = await pool.query("SELECT id FROM users WHERE email = $1", [adminEmail]);
  const userId: number | undefined = userResult.rows[0]?.id;
  if (!userId) {
    return NextResponse.json(
      { error: `There's no site account for ${adminEmail} yet. Sign up on the site with this email first.` },
      { status: 409 }
    );
  }

  const parent = await pool.query("SELECT lesson_id FROM course_comments WHERE id = $1", [parentId]);
  if (parent.rowCount !== 1) return NextResponse.json({ error: "Comment not found." }, { status: 404 });

  const created = await createCourseComment({
    userId,
    lessonId: parent.rows[0].lesson_id,
    body: body.trim(),
    parentCommentId: parentId,
  });
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: created.status });
  return NextResponse.json({ ok: true, id: created.id });
}
