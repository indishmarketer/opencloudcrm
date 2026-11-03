import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { courseResourceSchema, parsePositiveId, validationMessage } from "@/lib/courseStudio";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string  }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const courseId = parsePositiveId((await params).id);
  if (!courseId) return NextResponse.json({ error: "Invalid course." }, { status: 400 });
  const parsed = courseResourceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const { lesson_id, label, url, position } = parsed.data;

  // Verify lesson belongs to course
  const check = await pool.query(
    "SELECT l.id FROM course_lessons l JOIN course_modules m ON m.id = l.module_id WHERE l.id = $1 AND m.course_id = $2",
    [lesson_id, courseId]
  );
  if (check.rows.length === 0) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });

  const result = await pool.query(
    "INSERT INTO lesson_resources (lesson_id, label, url, position) VALUES ($1, $2, $3, $4) RETURNING *",
    [lesson_id, label, url, position]
  );
  
  return NextResponse.json({ resource: result.rows[0] });
}
