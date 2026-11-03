import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { courseCreateSchema, validationMessage } from "@/lib/courseStudio";

export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const parsed = courseCreateSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
    const { title, slug } = parsed.data;

    const result = await pool.query(
      "INSERT INTO courses (title, slug, published) VALUES ($1, $2, false) RETURNING id, title, slug",
      [title, slug]
    );

    return NextResponse.json({ course: result.rows[0] });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "A course with this slug already exists" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create course" }, { status: 500 });
  }
}
