import { pool } from "@/lib/db";
import { isConsoleOwner } from "@/lib/consoleAdmins";

export type Tier = "free" | "pro";

export type CourseLesson = {
  id: number;
  module_id: number;
  title: string;
  description: string | null;
  video_type: "youtube" | "r2";
  video_ref: string | null;
  position: number;
};

export type CourseModule = {
  id: number;
  course_id: number;
  title: string;
  description: string | null;
  tier: Tier;
  position: number;
  lessons: CourseLesson[];
};

export type Course = {
  id: number;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  cover_image_url: string | null;
  price: number | null;
  price_currency: "INR" | "USD";
  published: boolean;
  created_at: string;
};

export async function getCourseBySlug(slug: string): Promise<Course | null> {
  const result = await pool.query("SELECT * FROM courses WHERE slug = $1", [slug]);
  return result.rows[0] || null;
}

export async function getCourseCurriculum(courseId: number): Promise<CourseModule[]> {
  const [modulesResult, lessonsResult] = await Promise.all([
    pool.query(
      "SELECT * FROM course_modules WHERE course_id = $1 ORDER BY position",
      [courseId]
    ),
    pool.query(
      `SELECT l.* FROM course_lessons l
       JOIN course_modules m ON m.id = l.module_id
       WHERE m.course_id = $1
       ORDER BY l.position`,
      [courseId]
    ),
  ]);

  return modulesResult.rows.map((m) => ({
    ...m,
    lessons: lessonsResult.rows.filter((l) => l.module_id === m.id),
  }));
}

/** The site owner always has full PRO access to every course, no purchase
 * or manual grant needed -- checked unconditionally before the real
 * enrollment lookup so it applies even if no course_enrollments row
 * exists yet, and even overrides a stale non-pro row. */
export async function getUserEnrollment(
  userId: number,
  courseId: number
): Promise<{ tier: Tier } | null> {
  const userResult = await pool.query("SELECT email FROM users WHERE id = $1", [userId]);
  if (isConsoleOwner(userResult.rows[0]?.email || "")) return { tier: "pro" };

  const result = await pool.query(
    "SELECT tier FROM course_enrollments WHERE user_id = $1 AND course_id = $2",
    [userId, courseId]
  );
  return result.rows[0] || null;
}

export async function getCompletedLessonIds(userId: number, courseId: number): Promise<Set<number>> {
  const result = await pool.query(
    `SELECT lp.lesson_id FROM lesson_progress lp
     JOIN course_lessons l ON l.id = lp.lesson_id
     JOIN course_modules m ON m.id = l.module_id
     WHERE lp.user_id = $1 AND m.course_id = $2`,
    [userId, courseId]
  );
  return new Set(result.rows.map((r) => r.lesson_id));
}

/** Tier order for entitlement checks: pro unlocks everything free unlocks too. */
export function tierSatisfies(granted: Tier, required: Tier): boolean {
  if (required === "free") return true;
  return granted === "pro";
}

export type CourseComment = {
  id: number;
  lesson_id: number;
  user_id: number;
  author_name: string | null;
  author_username: string | null;
  author_avatar_url: string | null;
  /** The site owner (ADMIN_EMAIL), shown with a "Creator" badge. */
  author_is_creator: boolean;
  parent_comment_id: number | null;
  body: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

export async function listCourseComments(lessonId: number): Promise<CourseComment[]> {
  const result = await pool.query(
    `SELECT cc.*, u.name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar_url,
       (u.email = $2) AS author_is_creator
     FROM course_comments cc
     JOIN users u ON u.id = cc.user_id
     WHERE cc.lesson_id = $1 AND cc.status = 'approved'
     ORDER BY cc.created_at ASC`,
    [lessonId, process.env.ADMIN_EMAIL || ""]
  );
  return result.rows;
}

/** Re-verifies enrollment server-side for the API route -- never trust that the
 * client only calls this from a page that already gated access. */
export async function canCommentOnLesson(userId: number, lessonId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT m.tier AS module_tier, m.course_id
     FROM course_lessons l
     JOIN course_modules m ON m.id = l.module_id
     WHERE l.id = $1`,
    [lessonId]
  );
  const lesson = result.rows[0];
  if (!lesson) return false;
  const enrollment = await getUserEnrollment(userId, lesson.course_id);
  if (!enrollment) return false;
  return tierSatisfies(enrollment.tier, lesson.module_tier);
}
