import { NextResponse } from "next/server";
import { getFollowUpCourse } from "@/lib/followUpCourse";

/** What the guide popup offers after it has sent the guide.
 *
 * Fetched by the popup rather than passed down with the page, because
 * the popup is rendered from the hero block and its data travels through
 * the page editor's live-data path too. Threading one marketing link
 * through all of that would make the offer a thing the page builder has
 * to know about. Nothing here is secret and it is only called once
 * somebody has submitted the form.
 *
 * Returns { course: null } when the course is unpublished, which is the
 * normal state until the lessons have videos. */
export async function GET() {
  const course = await getFollowUpCourse();
  return NextResponse.json(
    { course },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } },
  );
}
