import { pool } from "@/lib/db";

// Console-only reporting on course enrollments and lesson progress. Every
// query leaves out the owner and invited console admins, matching the
// Students tab, so test enrollments don't skew the numbers.
const EXCLUDE_STAFF = `u.email != $1 AND u.email NOT IN (SELECT email FROM console_admins)`;

function adminEmail() {
  return process.env.ADMIN_EMAIL || "";
}

export type CourseOverview = {
  course_id: number;
  students: number;
  pro_students: number;
  completed_students: number;
  active_7d: number;
  avg_progress: number;
};

/** Headline numbers per course for the Course Studio list. Progress is
 * measured against the lessons each student can actually open (a free
 * student is 100% done once every free lesson is complete). */
export async function getCourseOverviews(): Promise<Map<number, CourseOverview>> {
  const result = await pool.query(
    `WITH per_student AS (
       SELECT ce.course_id, ce.user_id, ce.tier,
         COUNT(l.id) FILTER (WHERE ce.tier = 'pro' OR m.tier = 'free')::int AS accessible,
         COUNT(lp.id) FILTER (WHERE ce.tier = 'pro' OR m.tier = 'free')::int AS completed,
         MAX(lp.completed_at) AS last_activity
       FROM course_enrollments ce
       JOIN users u ON u.id = ce.user_id
       LEFT JOIN course_modules m ON m.course_id = ce.course_id
       LEFT JOIN course_lessons l ON l.module_id = m.id
       LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = ce.user_id
       WHERE ${EXCLUDE_STAFF}
       GROUP BY ce.id
     )
     SELECT course_id,
       COUNT(*)::int AS students,
       COUNT(*) FILTER (WHERE tier = 'pro')::int AS pro_students,
       COUNT(*) FILTER (WHERE accessible > 0 AND completed >= accessible)::int AS completed_students,
       COUNT(*) FILTER (WHERE last_activity > now() - interval '7 days')::int AS active_7d,
       COALESCE(ROUND(AVG(CASE WHEN accessible > 0 THEN completed * 100.0 / accessible ELSE 0 END)), 0)::int AS avg_progress
     FROM per_student
     GROUP BY course_id`,
    [adminEmail()]
  );
  return new Map(result.rows.map((r) => [r.course_id, r]));
}

export type ModuleProgress = {
  module_id: number;
  title: string;
  tier: "free" | "pro";
  total: number;
  completed: number;
  locked: boolean;
};

export type StudentProgress = {
  enrollment_id: number;
  user_id: number;
  name: string | null;
  email: string;
  username: string | null;
  avatar_url: string | null;
  tier: "free" | "pro";
  granted_via: string;
  enrolled_at: string;
  accessible_lessons: number;
  completed_lessons: number;
  last_activity: string | null;
  next_lesson_title: string | null;
  modules: ModuleProgress[];
};

export async function getCourseStudentProgress(courseId: number): Promise<StudentProgress[]> {
  const [studentsResult, modulesResult] = await Promise.all([
    pool.query(
      `SELECT ce.id AS enrollment_id, u.id AS user_id, u.name, u.email, u.username, u.avatar_url,
         ce.tier, ce.granted_via, ce.created_at AS enrolled_at
       FROM course_enrollments ce
       JOIN users u ON u.id = ce.user_id
       WHERE ce.course_id = $2 AND ${EXCLUDE_STAFF}
       ORDER BY ce.created_at DESC`,
      [adminEmail(), courseId]
    ),
    pool.query(
      `SELECT m.id AS module_id, m.title, m.tier, m.position AS module_position,
         l.id AS lesson_id, l.title AS lesson_title, l.position AS lesson_position
       FROM course_modules m
       LEFT JOIN course_lessons l ON l.module_id = m.id
       WHERE m.course_id = $1
       ORDER BY m.position, l.position`,
      [courseId]
    ),
  ]);

  const userIds = studentsResult.rows.map((s) => s.user_id);
  const progressResult = userIds.length
    ? await pool.query(
        `SELECT lp.user_id, lp.lesson_id, lp.completed_at
         FROM lesson_progress lp
         JOIN course_lessons l ON l.id = lp.lesson_id
         JOIN course_modules m ON m.id = l.module_id
         WHERE m.course_id = $1 AND lp.user_id = ANY($2::int[])`,
        [courseId, userIds]
      )
    : { rows: [] as { user_id: number; lesson_id: number; completed_at: string }[] };

  const doneByUser = new Map<number, Map<number, string>>();
  for (const row of progressResult.rows) {
    if (!doneByUser.has(row.user_id)) doneByUser.set(row.user_id, new Map());
    doneByUser.get(row.user_id)!.set(row.lesson_id, row.completed_at);
  }

  const modules: { id: number; title: string; tier: "free" | "pro"; lessons: { id: number; title: string }[] }[] = [];
  for (const row of modulesResult.rows) {
    let mod = modules.find((m) => m.id === row.module_id);
    if (!mod) {
      mod = { id: row.module_id, title: row.title, tier: row.tier, lessons: [] };
      modules.push(mod);
    }
    if (row.lesson_id) mod.lessons.push({ id: row.lesson_id, title: row.lesson_title });
  }

  return studentsResult.rows.map((s) => {
    const done = doneByUser.get(s.user_id) || new Map<number, string>();
    let accessible = 0;
    let completed = 0;
    let lastActivity: string | null = null;
    let nextLesson: string | null = null;
    const moduleProgress: ModuleProgress[] = modules.map((m) => {
      const locked = s.tier !== "pro" && m.tier === "pro";
      let moduleDone = 0;
      for (const lesson of m.lessons) {
        const at = done.get(lesson.id);
        if (at) {
          moduleDone++;
          if (!lastActivity || new Date(at) > new Date(lastActivity)) lastActivity = at;
        } else if (!locked && !nextLesson) {
          nextLesson = lesson.title;
        }
      }
      if (!locked) {
        accessible += m.lessons.length;
        completed += moduleDone;
      }
      return { module_id: m.id, title: m.title, tier: m.tier, total: m.lessons.length, completed: moduleDone, locked };
    });
    return {
      ...s,
      accessible_lessons: accessible,
      completed_lessons: completed,
      last_activity: lastActivity,
      next_lesson_title: nextLesson,
      modules: moduleProgress,
    };
  });
}

export type LessonFunnelRow = {
  lesson_id: number;
  lesson_title: string;
  module_title: string;
  tier: "free" | "pro";
  eligible: number;
  completions: number;
  comments: number;
};

/** Per-lesson completion counts, in curriculum order, so drop-off points
 * are visible. `eligible` is how many students can open that lesson. */
export async function getCourseLessonFunnel(courseId: number): Promise<LessonFunnelRow[]> {
  const result = await pool.query(
    `WITH students AS (
       SELECT ce.user_id, ce.tier FROM course_enrollments ce
       JOIN users u ON u.id = ce.user_id
       WHERE ce.course_id = $2 AND ${EXCLUDE_STAFF}
     )
     SELECT l.id AS lesson_id, l.title AS lesson_title, m.title AS module_title, m.tier,
       (SELECT COUNT(*) FROM students s WHERE s.tier = 'pro' OR m.tier = 'free')::int AS eligible,
       (SELECT COUNT(*) FROM lesson_progress lp JOIN students s ON s.user_id = lp.user_id
        WHERE lp.lesson_id = l.id)::int AS completions,
       (SELECT COUNT(*) FROM course_comments cc WHERE cc.lesson_id = l.id AND cc.status = 'approved')::int AS comments
     FROM course_modules m
     JOIN course_lessons l ON l.module_id = m.id
     WHERE m.course_id = $2
     ORDER BY m.position, l.position`,
    [adminEmail(), courseId]
  );
  return result.rows;
}

export type ConsoleCourseComment = {
  id: number;
  body: string;
  created_at: string;
  parent_comment_id: number | null;
  lesson_id: number;
  lesson_title: string;
  author_name: string | null;
  author_username: string | null;
  author_avatar_url: string | null;
  author_is_creator: boolean;
  reply_count: number;
  creator_replied: boolean;
  replies: {
    id: number;
    body: string;
    created_at: string;
    author_name: string | null;
    author_avatar_url: string | null;
    author_is_creator: boolean;
  }[];
};

/** Latest top-level lesson comments for one course, flagged by whether the
 * creator has answered yet, so unanswered questions stand out. */
export async function listRecentCourseComments(courseId: number, limit = 50): Promise<ConsoleCourseComment[]> {
  const result = await pool.query(
    `SELECT cc.id, cc.body, cc.created_at, cc.parent_comment_id, l.id AS lesson_id, l.title AS lesson_title,
       u.name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar_url,
       (u.email = $1) AS author_is_creator,
       (SELECT COUNT(*) FROM course_comments r WHERE r.parent_comment_id = cc.id AND r.status = 'approved')::int AS reply_count,
       EXISTS(
         SELECT 1 FROM course_comments r JOIN users ru ON ru.id = r.user_id
         WHERE r.parent_comment_id = cc.id AND ru.email = $1
       ) AS creator_replied
     FROM course_comments cc
     JOIN users u ON u.id = cc.user_id
     JOIN course_lessons l ON l.id = cc.lesson_id
     JOIN course_modules m ON m.id = l.module_id
     WHERE m.course_id = $2 AND cc.parent_comment_id IS NULL AND cc.status = 'approved'
     ORDER BY cc.created_at DESC
     LIMIT $3`,
    [adminEmail(), courseId, limit]
  );
  const ids = result.rows.map((r) => r.id);
  const replies = ids.length
    ? await pool.query(
        `SELECT r.id, r.parent_comment_id, r.body, r.created_at, u.name AS author_name,
           u.avatar_url AS author_avatar_url, (u.email = $1) AS author_is_creator
         FROM course_comments r
         JOIN users u ON u.id = r.user_id
         WHERE r.parent_comment_id = ANY($2::int[]) AND r.status = 'approved'
         ORDER BY r.created_at ASC`,
        [adminEmail(), ids]
      )
    : { rows: [] as (ConsoleCourseComment["replies"][number] & { parent_comment_id: number })[] };
  return result.rows.map((c) => ({
    ...c,
    replies: replies.rows.filter((r) => r.parent_comment_id === c.id),
  }));
}
