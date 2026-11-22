import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, getSession } from "@/lib/auth";
import { isConsoleOwner } from "@/lib/consoleAdmins";
import { pool } from "@/lib/db";
import { courseResourceUpdateSchema, parsePositiveId, validationMessage } from "@/lib/courseStudio";

async function isAuthorized(): Promise<boolean> {
  if (await getAdminSession()) return true;
  const session = await getSession();
  return !!session && isConsoleOwner(session.email);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; resourceId: string }> }) {
  if (!(await isAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, resourceId } = await params;
  const courseId = parsePositiveId(id);
  const parsedResourceId = parsePositiveId(resourceId);
  if (!courseId || !parsedResourceId) return NextResponse.json({ error: "Invalid course or resource." }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = courseResourceUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });

  // Verify resource belongs to course
  const check = await pool.query(
    `SELECT r.id FROM lesson_resources r
     JOIN course_lessons l ON l.id = r.lesson_id
     JOIN course_modules m ON m.id = l.module_id
     WHERE r.id = $1 AND m.course_id = $2`,
    [parsedResourceId, courseId]
  );

  if (check.rows.length === 0) return NextResponse.json({ error: "Resource not found" }, { status: 404 });

  const { label, url, type, content, icon, position } = parsed.data;

  const result = await pool.query(
    `UPDATE lesson_resources SET
       label = COALESCE($1, label),
       url = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE url END,
       type = COALESCE($3, type),
       content = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE content END,
       icon = CASE WHEN $5::text IS NOT NULL THEN $5 ELSE icon END,
       position = COALESCE($6, position)
     WHERE id = $7
     RETURNING *`,
    [
      label ?? null,
      url !== undefined ? url : null,
      type ?? null,
      content !== undefined ? content : null,
      icon !== undefined ? icon : null,
      position ?? null,
      parsedResourceId,
    ]
  );

  return NextResponse.json({ resource: result.rows[0] });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; resourceId: string }> }) {
  if (!(await isAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, resourceId } = await params;
  const courseId = parsePositiveId(id);
  const parsedResourceId = parsePositiveId(resourceId);
  if (!courseId || !parsedResourceId) return NextResponse.json({ error: "Invalid course or resource." }, { status: 400 });

  const check = await pool.query(
    `SELECT r.id FROM lesson_resources r
     JOIN course_lessons l ON l.id = r.lesson_id
     JOIN course_modules m ON m.id = l.module_id
     WHERE r.id = $1 AND m.course_id = $2`,
    [parsedResourceId, courseId]
  );

  if (check.rows.length === 0) return NextResponse.json({ error: "Resource not found" }, { status: 404 });

  await pool.query("DELETE FROM lesson_resources WHERE id = $1", [parsedResourceId]);

  return NextResponse.json({ ok: true });
}
