import { pool } from "@/lib/db";
import ConsoleCourseStudents from "@/components/ConsoleCourseStudents";

export default async function ConsoleCourseStudentsPage() {
  const [courses, students] = await Promise.all([
    pool.query(`SELECT id, title, EXISTS(SELECT 1 FROM course_modules m WHERE m.course_id = courses.id AND m.tier = 'free') AS has_free_tier FROM courses ORDER BY title ASC`),
    pool.query(
      `
      SELECT
        ce.id AS enrollment_id,
        c.id AS course_id, c.title AS course_title,
        EXISTS(SELECT 1 FROM course_modules m WHERE m.course_id = c.id AND m.tier = 'free') AS has_free_tier,
        u.id AS user_id, u.name, u.email, u.avatar_url, ce.tier, ce.created_at AS enrolled_at,
        COUNT(l.id) FILTER (WHERE ce.tier = 'pro' OR m2.tier = 'free')::int AS total_lessons,
        COUNT(lp.id) FILTER (WHERE ce.tier = 'pro' OR m2.tier = 'free')::int AS completed_lessons,
        MAX(lp.completed_at) AS last_activity
      FROM course_enrollments ce
      JOIN users u ON u.id = ce.user_id
      JOIN courses c ON c.id = ce.course_id
      LEFT JOIN course_modules m2 ON m2.course_id = c.id
      LEFT JOIN course_lessons l ON l.module_id = m2.id
      LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = ce.user_id
      WHERE u.email != $1 AND u.email NOT IN (SELECT email FROM console_admins)
      GROUP BY ce.id, c.id, u.id, ce.tier
      ORDER BY ce.created_at DESC
    `,
      [process.env.ADMIN_EMAIL || ""]
    ),
  ]);

  return (
    <>
      <ConsoleCourseStudents courses={courses.rows} students={students.rows} />
    </>
  );
}
