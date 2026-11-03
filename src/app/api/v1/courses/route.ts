import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/apiTokens";
import { pool } from "@/lib/db";
import { courseCreateSchema, validationMessage } from "@/lib/courseStudio";

export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, "courses:read");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await pool.query(
    `SELECT c.id, c.title, c.slug, c.subtitle, c.description, c.cover_image_url, c.price,
            c.price_currency, c.published,
            (SELECT count(*)::int FROM course_modules m WHERE m.course_id = c.id) AS module_count,
            (SELECT count(*)::int FROM course_lessons l JOIN course_modules m ON m.id = l.module_id WHERE m.course_id = c.id) AS lesson_count
     FROM courses c ORDER BY c.id DESC`,
  );
  return NextResponse.json({ courses: result.rows });
}

/** Courses are database records. Creating one through the API or Console
 * writes the same row; no course seed or content file is needed in Git. */
export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, "courses:write");
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = courseCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  try {
    const result = await pool.query(
      "INSERT INTO courses (title, slug, published) VALUES ($1, $2, false) RETURNING *",
      [parsed.data.title, parsed.data.slug],
    );
    return NextResponse.json({ course: result.rows[0] }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "A course with this slug already exists." }, { status: 409 });
    }
    throw error;
  }
}
