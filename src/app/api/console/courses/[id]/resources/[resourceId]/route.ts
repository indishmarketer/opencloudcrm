import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { courseResourceUpdateSchema, parsePositiveId, validationMessage } from "@/lib/courseStudio";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string, resourceId: string  }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, resourceId } = await params;
  const courseId = parsePositiveId(id);
  const parsedResourceId = parsePositiveId(resourceId);
  if (!courseId || !parsedResourceId) return NextResponse.json({ error: "Invalid course or resource." }, { status: 400 });
  const parsed = courseResourceUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const { label, url } = parsed.data;

  // Verify resource belongs to course
  const check = await pool.query(`
    SELECT r.id FROM lesson_resources r
    JOIN course_lessons l ON l.id = r.lesson_id
    JOIN course_modules m ON m.id = l.module_id
    WHERE r.id = $1 AND m.course_id = $2
  `, [parsedResourceId, courseId]);
  
  if (check.rows.length === 0) return NextResponse.json({ error: "Resource not found" }, { status: 404 });

  const result = await pool.query(
    "UPDATE lesson_resources SET label = COALESCE($1, label), url = COALESCE($2, url) WHERE id = $3 RETURNING *",
    [label, url, parsedResourceId]
  );
  
  return NextResponse.json({ resource: result.rows[0] });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string, resourceId: string  }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, resourceId } = await params;
  const courseId = parsePositiveId(id);
  const parsedResourceId = parsePositiveId(resourceId);
  if (!courseId || !parsedResourceId) return NextResponse.json({ error: "Invalid course or resource." }, { status: 400 });
  const check = await pool.query(`
    SELECT r.id FROM lesson_resources r
    JOIN course_lessons l ON l.id = r.lesson_id
    JOIN course_modules m ON m.id = l.module_id
    WHERE r.id = $1 AND m.course_id = $2
  `, [parsedResourceId, courseId]);
  
  if (check.rows.length === 0) return NextResponse.json({ error: "Resource not found" }, { status: 404 });

  await pool.query("DELETE FROM lesson_resources WHERE id = $1", [parsedResourceId]);
  
  return NextResponse.json({ ok: true });
}
