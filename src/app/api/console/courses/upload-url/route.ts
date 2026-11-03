import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createCourseVideoUpload } from "@/lib/courseVideoStorage";
import { parsePositiveId } from "@/lib/courseStudio";

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const filename = url.searchParams.get("filename");
  const contentType = url.searchParams.get("contentType");
  const courseId = parsePositiveId(url.searchParams.get("courseId") || "");
  const size = Number(url.searchParams.get("size"));

  if (!filename || !contentType || !courseId) {
    return NextResponse.json({ error: "Missing or invalid upload information." }, { status: 400 });
  }

  try {
    const exists = await pool.query("SELECT 1 FROM courses WHERE id = $1", [courseId]);
    if (exists.rowCount === 0) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    const result = await createCourseVideoUpload({ courseId, filename, contentType, size });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Presigned URL error:", error);
    return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 });
  }
}
