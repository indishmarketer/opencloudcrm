import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { deleteFromR2, uploadImageToR2 } from "@/lib/r2Upload";
import { parsePositiveId } from "@/lib/courseStudio";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const courseId = parsePositiveId((await params).id);
  if (!courseId) return NextResponse.json({ error: "Invalid course." }, { status: 400 });

  const courseResult = await pool.query("SELECT cover_image_url FROM courses WHERE id = $1", [courseId]);
  if (courseResult.rowCount === 0) return NextResponse.json({ error: "Course not found." }, { status: 404 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No image was provided." }, { status: 400 });

  let uploaded: Awaited<ReturnType<typeof uploadImageToR2>>;
  try {
    uploaded = await uploadImageToR2(file, `course-covers/${courseId}`);
  } catch {
    return NextResponse.json({ error: "The image upload failed. Please try again." }, { status: 502 });
  }
  if ("error" in uploaded) return NextResponse.json({ error: uploaded.error }, { status: 400 });
  await pool.query("UPDATE courses SET cover_image_url = $1 WHERE id = $2", [uploaded.url, courseId]);

  const previous = courseResult.rows[0].cover_image_url;
  if (previous && previous !== uploaded.url && previous.includes(`/course-covers/${courseId}/`)) await deleteFromR2(previous);
  return NextResponse.json({ ok: true, url: uploaded.url });
}
