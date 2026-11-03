import { pool } from "@/lib/db";
import { getCourseOverviews } from "@/lib/courseAnalytics";
import ConsoleCourseList from "@/components/ConsoleCourseList";

export default async function ConsoleCoursesPage() {
  const [result, overviews] = await Promise.all([
    pool.query(`
      SELECT c.id, c.slug, c.title, c.price, c.price_currency, c.published,
        EXISTS(SELECT 1 FROM course_modules m WHERE m.course_id = c.id AND m.tier = 'free') AS has_free_tier,
        EXISTS(SELECT 1 FROM course_modules m WHERE m.course_id = c.id AND m.tier = 'pro') AS has_pro_tier
      FROM courses c ORDER BY c.created_at DESC
    `),
    getCourseOverviews(),
  ]);

  const courses = result.rows.map((c) => ({ ...c, overview: overviews.get(c.id) ?? null }));
  return <ConsoleCourseList courses={courses} />;
}
