import { pool } from "@/lib/db";
import { notFound } from "next/navigation";
import ConsoleCourseSettings from "@/components/ConsoleCourseSettings";
import { getInrPerUsdRate } from "@/lib/currency";

export default async function CourseSettingsPage({ params }: { params: Promise<{ id: string  }> }) {
  const [courseRes, modulesRes, lessonsRes] = await Promise.all([
    pool.query("SELECT * FROM courses WHERE id = $1", [(await params).id]),
    pool.query("SELECT id, tier, position FROM course_modules WHERE course_id = $1", [(await params).id]),
    pool.query(`
      SELECT l.id, l.module_id, l.video_type, l.video_ref, l.position
      FROM course_lessons l
      JOIN course_modules m ON m.id = l.module_id
      WHERE m.course_id = $1
    `, [(await params).id]),
  ]);

  if (courseRes.rows.length === 0) return notFound();

  const course = courseRes.rows[0];
  const modules = modulesRes.rows;
  const lessons = lessonsRes.rows;

  return <ConsoleCourseSettings course={course} modules={modules} lessons={lessons} inrPerUsd={await getInrPerUsdRate()} />;
}
