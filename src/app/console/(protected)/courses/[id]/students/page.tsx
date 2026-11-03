import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import { getCourseLessonFunnel, getCourseStudentProgress } from "@/lib/courseAnalytics";
import ConsoleCourseProgress from "@/components/ConsoleCourseProgress";

export default async function CourseStudentsProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const courseId = Number((await params).id);
  if (!Number.isInteger(courseId)) notFound();

  const [courseRes, students, funnel] = await Promise.all([
    pool.query(
      `SELECT id, slug, title,
         EXISTS(SELECT 1 FROM course_modules m WHERE m.course_id = courses.id AND m.tier = 'free') AS has_free_tier
       FROM courses WHERE id = $1`,
      [courseId]
    ),
    getCourseStudentProgress(courseId),
    getCourseLessonFunnel(courseId),
  ]);
  if (courseRes.rows.length === 0) notFound();

  return <ConsoleCourseProgress course={courseRes.rows[0]} students={students} funnel={funnel} />;
}
