import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import { listRecentCourseComments } from "@/lib/courseAnalytics";
import ConsoleCourseComments from "@/components/ConsoleCourseComments";

export default async function CourseCommentsPage({ params }: { params: Promise<{ id: string }> }) {
  const courseId = Number((await params).id);
  if (!Number.isInteger(courseId)) notFound();

  const [courseRes, comments] = await Promise.all([
    pool.query("SELECT slug FROM courses WHERE id = $1", [courseId]),
    listRecentCourseComments(courseId, 100),
  ]);
  if (courseRes.rows.length === 0) notFound();

  return <ConsoleCourseComments courseSlug={courseRes.rows[0].slug} comments={comments} />;
}
