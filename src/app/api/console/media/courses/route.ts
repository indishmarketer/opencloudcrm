import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail } from "@/lib/auth";
import { getCourseVideoPreviewUrl, listCourseVideoObjects } from "@/lib/courseVideoStorage";
import { pool } from "@/lib/db";
import { parsePositiveId } from "@/lib/courseStudio";

/** Read-only: lists what's in the course-videos R2 bucket (never a public
 * bucket, see courseVideoStorage.ts) and hands out short-lived admin
 * preview links. No upload/delete here -- videos are managed from each
 * course's curriculum editor, where the matching lesson row is visible, so
 * deleting a file out from under a published lesson can't happen by
 * accident from this listing. */
export async function GET(req: NextRequest) {
  if (!(await getAdminSessionEmail())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const previewKey = req.nextUrl.searchParams.get("previewKey");
  if (previewKey) {
    const result = await getCourseVideoPreviewUrl(previewKey);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 503 });
    return NextResponse.json(result);
  }

  const continuationToken = req.nextUrl.searchParams.get("continuationToken") || undefined;
  const courseId = parsePositiveId(req.nextUrl.searchParams.get("courseId") || "");
  const result = await listCourseVideoObjects({ continuationToken, courseId: courseId || undefined });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 503 });

  const courseIds = [...new Set(result.items.map((i) => i.courseId).filter((id): id is number => id !== null))];
  const titles = new Map<number, string>();
  if (courseIds.length > 0) {
    const rows = await pool.query("SELECT id, title FROM courses WHERE id = ANY($1)", [courseIds]);
    for (const row of rows.rows) titles.set(row.id, row.title);
  }

  return NextResponse.json({
    items: result.items.map((item) => ({ ...item, courseTitle: item.courseId ? titles.get(item.courseId) || null : null })),
    nextToken: result.nextToken,
  });
}
