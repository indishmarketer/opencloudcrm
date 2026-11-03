import { pool } from "@/lib/db";
import { notFound } from "next/navigation";
import ConsoleCourseCurriculum from "@/components/ConsoleCourseCurriculum";

export default async function CourseCurriculumPage({ params }: { params: Promise<{ id: string  }> }) {
  const [courseRes, modulesRes, lessonsRes, resourcesRes] = await Promise.all([
    pool.query("SELECT id, title FROM courses WHERE id = $1", [(await params).id]),
    pool.query("SELECT * FROM course_modules WHERE course_id = $1 ORDER BY position ASC", [(await params).id]),
    pool.query(`
      SELECT l.*
      FROM course_lessons l
      JOIN course_modules m ON m.id = l.module_id
      WHERE m.course_id = $1
      ORDER BY l.position ASC
    `, [(await params).id]),
    pool.query(`
      SELECT r.*
      FROM lesson_resources r
      JOIN course_lessons l ON l.id = r.lesson_id
      JOIN course_modules m ON m.id = l.module_id
      WHERE m.course_id = $1
      ORDER BY r.position ASC
    `, [(await params).id]),
  ]);

  if (courseRes.rows.length === 0) return notFound();

  return (
    <ConsoleCourseCurriculum
      courseId={parseInt((await params).id)}
      courseTitle={courseRes.rows[0].title}
      initialModules={modulesRes.rows}
      initialLessons={lessonsRes.rows}
      initialResources={resourcesRes.rows}
    />
  );
}
