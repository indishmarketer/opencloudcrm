import { pool } from "@/lib/db";

export type NotificationType =
  | "post_approved"
  | "post_liked"
  | "post_commented"
  | "comment_replied"
  | "new_message"
  | "course_inactive"
  | "review_requested";

export type Notification = {
  id: number;
  user_id: number;
  type: NotificationType;
  actor_id: number | null;
  actor_name: string | null;
  actor_username: string | null;
  actor_avatar: string | null;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

/** Never notifies a user about their own action (e.g. liking your own post). */
export async function createNotification(
  userId: number,
  type: NotificationType,
  opts: { actorId?: number | null; title: string; body?: string; link?: string }
): Promise<void> {
  if (opts.actorId && opts.actorId === userId) return;
  await pool.query(
    `INSERT INTO notifications (user_id, type, actor_id, title, body, link)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, type, opts.actorId ?? null, opts.title, opts.body ?? null, opts.link ?? null]
  );
}

export async function listNotifications(userId: number, limit = 30): Promise<Notification[]> {
  const result = await pool.query(
    `SELECT n.*, u.name AS actor_name, u.username AS actor_username, u.avatar_url AS actor_avatar
     FROM notifications n
     LEFT JOIN users u ON u.id = n.actor_id
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

export async function getUnreadNotificationCount(userId: number): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return result.rows[0].count;
}

export async function markNotificationsRead(userId: number): Promise<void> {
  await pool.query(
    `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
}
