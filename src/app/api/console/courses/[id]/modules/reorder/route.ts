import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { courseReorderSchema, parsePositiveId, validationMessage } from "@/lib/courseStudio";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string  }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const courseId = parsePositiveId((await params).id);
  if (!courseId) return NextResponse.json({ error: "Invalid course." }, { status: 400 });
  const parsed = courseReorderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const { updates } = parsed.data;
  if (new Set(updates.map((update) => update.id)).size !== updates.length) {
    return NextResponse.json({ error: "Duplicate module ids are not allowed." }, { status: 400 });
  }
  
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const update of updates) {
      const result = await client.query("UPDATE course_modules SET position = $1 WHERE id = $2 AND course_id = $3", [update.position, update.id, courseId]);
      if (result.rowCount !== 1) throw new Error("Module does not belong to this course.");
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  
  return NextResponse.json({ ok: true });
}
