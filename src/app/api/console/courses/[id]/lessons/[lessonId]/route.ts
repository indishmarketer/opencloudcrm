import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { sanitizeBlogHtml } from "@/lib/sanitizeBlogHtml";
import { courseLessonUpdateSchema, normalizeCourseVideoRef, parsePositiveId, validationMessage } from "@/lib/courseStudio";
import { deleteCourseVideos } from "@/lib/courseVideoStorage";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string, lessonId: string  }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, lessonId } = await params;
  const courseId = parsePositiveId(id);
  const parsedLessonId = parsePositiveId(lessonId);
  if (!courseId || !parsedLessonId) return NextResponse.json({ error: "Invalid course or lesson." }, { status: 400 });
  const parsed = courseLessonUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const { title, description, video_type, video_ref } = parsed.data;
  // Verify lesson belongs to course
  const check = await pool.query(
    "SELECT l.* FROM course_lessons l JOIN course_modules m ON m.id = l.module_id WHERE l.id = $1 AND m.course_id = $2",
    [parsedLessonId, courseId]
  );
  if (check.rows.length === 0) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  const current = check.rows[0];
  const nextVideoType = video_type || current.video_type;
  const requestedVideoRef = Object.hasOwn(parsed.data, "video_ref") ? video_ref : current.video_ref;
  const normalizedVideo = normalizeCourseVideoRef(nextVideoType, requestedVideoRef, courseId, current.video_ref);
  if ("error" in normalizedVideo) return NextResponse.json({ error: normalizedVideo.error }, { status: 400 });
  const safeHtml = Object.hasOwn(parsed.data, "description")
    ? (description ? sanitizeBlogHtml(description) : null)
    : current.description;

  const result = await pool.query(
    "UPDATE course_lessons SET title = COALESCE($1, title), description = $2, video_type = COALESCE($3, video_type), video_ref = $4 WHERE id = $5 RETURNING *",
    [title, safeHtml, video_type, normalizedVideo.value, parsedLessonId]
  );
  if (current.video_type === "r2" && current.video_ref && current.video_ref !== result.rows[0].video_ref) {
    const stillUsed = await pool.query("SELECT 1 FROM course_lessons WHERE video_type = 'r2' AND video_ref = $1 LIMIT 1", [current.video_ref]);
    if (stillUsed.rowCount === 0) await deleteCourseVideos([current.video_ref]);
  }
  
  return NextResponse.json({ lesson: result.rows[0] });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string, lessonId: string  }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, lessonId } = await params;
  const courseId = parsePositiveId(id);
  const parsedLessonId = parsePositiveId(lessonId);
  if (!courseId || !parsedLessonId) return NextResponse.json({ error: "Invalid course or lesson." }, { status: 400 });
  // Verify lesson belongs to course
  const check = await pool.query(
    "SELECT l.* FROM course_lessons l JOIN course_modules m ON m.id = l.module_id WHERE l.id = $1 AND m.course_id = $2",
    [parsedLessonId, courseId]
  );
  if (check.rows.length === 0) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });

  const lesson = check.rows[0];
  await pool.query("DELETE FROM course_lessons WHERE id = $1", [parsedLessonId]);
  if (lesson.video_type === "r2" && lesson.video_ref) {
    const stillUsed = await pool.query("SELECT 1 FROM course_lessons WHERE video_type = 'r2' AND video_ref = $1 LIMIT 1", [lesson.video_ref]);
    if (stillUsed.rowCount === 0) await deleteCourseVideos([lesson.video_ref]);
  }
  
  return NextResponse.json({ ok: true });
}
