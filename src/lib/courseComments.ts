import { pool } from "@/lib/db";
import { createNotification } from "@/lib/notifications";

export type CreateCourseCommentResult =
  | { ok: true; id: number }
  | { ok: false; status: number; error: string };

/** Inserts a lesson comment or reply and sends its notifications. Callers
 * must already have checked the author may comment on this lesson.
 *
 * Threads are one level deep: replying to a reply attaches to its top-level
 * comment, but whoever was replied to is still the one notified. */
export async function createCourseComment(opts: {
  userId: number;
  lessonId: number;
  body: string;
  parentCommentId?: number | null;
}): Promise<CreateCourseCommentResult> {
  let parentId: number | null = null;
  let repliedToUserId: number | null = null;
  if (opts.parentCommentId !== undefined && opts.parentCommentId !== null) {
    const parent = await pool.query(
      "SELECT id, user_id, parent_comment_id FROM course_comments WHERE id = $1 AND lesson_id = $2 AND status = 'approved'",
      [opts.parentCommentId, opts.lessonId]
    );
    if (parent.rowCount !== 1) {
      return { ok: false, status: 400, error: "Parent comment is not part of this lesson." };
    }
    parentId = parent.rows[0].parent_comment_id ?? parent.rows[0].id;
    repliedToUserId = parent.rows[0].user_id;
  }

  const result = await pool.query(
    `INSERT INTO course_comments (lesson_id, user_id, parent_comment_id, body)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [opts.lessonId, opts.userId, parentId, opts.body.slice(0, 5000)]
  );
  const commentId: number = result.rows[0].id;

  await pool.query("UPDATE users SET community_points = community_points + 1 WHERE id = $1", [opts.userId]);

  // Best-effort: a notification failure must not fail the comment itself.
  try {
    const context = await pool.query(
      `SELECT l.title AS lesson_title, c.slug AS course_slug,
         (SELECT id FROM users WHERE email = $2) AS owner_id
       FROM course_lessons l
       JOIN course_modules m ON m.id = l.module_id
       JOIN courses c ON c.id = m.course_id
       WHERE l.id = $1`,
      [opts.lessonId, process.env.ADMIN_EMAIL || ""]
    );
    const ctx = context.rows[0];
    if (ctx) {
      const link = `/account/courses/${ctx.course_slug}/lessons/${opts.lessonId}#comment-${commentId}`;
      const notified = new Set<number>([opts.userId]);
      if (repliedToUserId && !notified.has(repliedToUserId)) {
        notified.add(repliedToUserId);
        await createNotification(repliedToUserId, "comment_replied", {
          actorId: opts.userId,
          title: "Someone replied to your comment",
          body: ctx.lesson_title,
          link,
        });
      }
      // The creator hears about every lesson comment so questions get answered.
      if (ctx.owner_id && !notified.has(ctx.owner_id)) {
        await createNotification(ctx.owner_id, "post_commented", {
          actorId: opts.userId,
          title: parentId ? "New reply on a lesson" : "New comment on a lesson",
          body: ctx.lesson_title,
          link,
        });
      }
    }
  } catch (error) {
    console.error("Course comment notification failed:", error);
  }

  return { ok: true, id: commentId };
}
