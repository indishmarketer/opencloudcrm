import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { courseModuleSchema, parsePositiveId, validationMessage } from "@/lib/courseStudio";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string  }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const courseId = parsePositiveId((await params).id);
  if (!courseId) return NextResponse.json({ error: "Invalid course." }, { status: 400 });
  const parsed = courseModuleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const { title, description, tier, position } = parsed.data;
  const course = await pool.query("SELECT 1 FROM courses WHERE id = $1", [courseId]);
  if (course.rowCount === 0) return NextResponse.json({ error: "Course not found." }, { status: 404 });
  
  const result = await pool.query(
    "INSERT INTO course_modules (course_id, title, description, tier, position) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [courseId, title, description, tier, position]
  );
  
  return NextResponse.json({ module: result.rows[0] });
}
