import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { courseModuleUpdateSchema, parsePositiveId, validationMessage } from "@/lib/courseStudio";
import { deleteCourseVideos } from "@/lib/courseVideoStorage";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string, moduleId: string  }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, moduleId } = await params;
  const courseId = parsePositiveId(id);
  const parsedModuleId = parsePositiveId(moduleId);
  if (!courseId || !parsedModuleId) return NextResponse.json({ error: "Invalid course or module." }, { status: 400 });
  const parsed = courseModuleUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const { title, description, tier } = parsed.data;
  const currentResult = await pool.query("SELECT description FROM course_modules WHERE id = $1 AND course_id = $2", [parsedModuleId, courseId]);
  if (currentResult.rowCount === 0) return NextResponse.json({ error: "Module not found." }, { status: 404 });
  const nextDescription = Object.hasOwn(parsed.data, "description") ? description : currentResult.rows[0].description;
  
  const result = await pool.query(
    "UPDATE course_modules SET title = COALESCE($1, title), description = $2, tier = COALESCE($3, tier) WHERE id = $4 AND course_id = $5 RETURNING *",
    [title, nextDescription, tier, parsedModuleId, courseId]
  );
  if (result.rowCount === 0) return NextResponse.json({ error: "Module not found." }, { status: 404 });
  
  return NextResponse.json({ module: result.rows[0] });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string, moduleId: string  }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, moduleId } = await params;
  const courseId = parsePositiveId(id);
  const parsedModuleId = parsePositiveId(moduleId);
  if (!courseId || !parsedModuleId) return NextResponse.json({ error: "Invalid course or module." }, { status: 400 });
  const videoResult = await pool.query(
    "SELECT video_ref FROM course_lessons WHERE module_id = $1 AND video_type = 'r2' AND video_ref IS NOT NULL",
    [parsedModuleId],
  );
  const result = await pool.query("DELETE FROM course_modules WHERE id = $1 AND course_id = $2 RETURNING id", [parsedModuleId, courseId]);
  if (result.rowCount === 0) return NextResponse.json({ error: "Module not found." }, { status: 404 });
  const orphaned: string[] = [];
  for (const row of videoResult.rows) {
    const stillUsed = await pool.query("SELECT 1 FROM course_lessons WHERE video_type = 'r2' AND video_ref = $1 LIMIT 1", [row.video_ref]);
    if (stillUsed.rowCount === 0) orphaned.push(row.video_ref);
  }
  await deleteCourseVideos(orphaned);
  
  return NextResponse.json({ ok: true });
}
