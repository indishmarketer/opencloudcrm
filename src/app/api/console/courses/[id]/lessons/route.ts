import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { sanitizeBlogHtml } from "@/lib/sanitizeBlogHtml";
import { courseLessonSchema, normalizeCourseVideoRef, parsePositiveId, validationMessage } from "@/lib/courseStudio";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string  }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const courseId = parsePositiveId((await params).id);
  if (!courseId) return NextResponse.json({ error: "Invalid course." }, { status: 400 });
  const parsed = courseLessonSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const { module_id, title, description, video_type, video_ref, position } = parsed.data;
  const safeHtml = description ? sanitizeBlogHtml(description) : null;
  const normalizedVideo = normalizeCourseVideoRef(video_type, video_ref, courseId);
  if ("error" in normalizedVideo) return NextResponse.json({ error: normalizedVideo.error }, { status: 400 });

  // Ensure module belongs to this course
  const moduleCheck = await pool.query("SELECT id FROM course_modules WHERE id = $1 AND course_id = $2", [module_id, courseId]);
  if (moduleCheck.rows.length === 0) return NextResponse.json({ error: "Invalid module" }, { status: 400 });

  const result = await pool.query(
    "INSERT INTO course_lessons (module_id, title, description, video_type, video_ref, position) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
    [module_id, title, safeHtml, video_type, normalizedVideo.value, position]
  );
  
  return NextResponse.json({ lesson: result.rows[0] });
}
