import { pool } from "@/lib/db";

/** What survives of the old lib/community.ts after the community and
 * webinar features were removed.
 *
 * None of this is community-specific, it just happened to live there: the
 * blog and course comment threads, the moderator check that lets those be
 * removed, the username generated for every new account, and the author
 * box on posts and courses. Pulling it into its own module is what let the
 * forum, its moderation queue, its direct messages and its leaderboard go
 * without taking blog comments down with them. */

export type MemberProfile = {
  id: number;
  username: string | null;
  name: string | null;
  email: string;
  avatar_url: string | null;
  bio: string | null;
  social_links: Record<string, string> | null;
  role: string | null;
  community_points: number;
  created_at: string;
};

export type BlogComment = {
  id: number;
  post_slug: string;
  user_id: number;
  body: string;
  status: string;
  created_at: string;
  author_name: string | null;
  author_username: string | null;
  author_avatar_url: string | null;
};

const PROFILE_COLUMNS =
  "id, username, name, email, avatar_url, bio, social_links, role, community_points, created_at";

export async function getProfileById(userId: number): Promise<MemberProfile | null> {
  const result = await pool.query(`SELECT ${PROFILE_COLUMNS} FROM users WHERE id = $1`, [userId]);
  return result.rows[0] || null;
}

/** The one ADMIN_EMAIL account, wherever it is linked from (blog author
 * box, course trainer bio). Null if that account does not exist yet. */
export async function getSiteOwnerProfile(): Promise<MemberProfile | null> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return null;
  const result = await pool.query(`SELECT ${PROFILE_COLUMNS} FROM users WHERE email = $1`, [adminEmail]);
  return result.rows[0] || null;
}

/** Who may remove someone else's blog or course comment. */
export async function isModeratorOrAdmin(userId: number): Promise<boolean> {
  const result = await pool.query("SELECT role, email FROM users WHERE id = $1", [userId]);
  const user = result.rows[0];
  if (!user) return false;
  if (user.role === "moderator") return true;
  const adminEmail = process.env.ADMIN_EMAIL;
  return !!adminEmail && user.email === adminEmail;
}

export async function listBlogComments(
  postSlug: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<BlogComment[]> {
  const result = await pool.query(
    `SELECT bc.*, u.name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar_url
     FROM blog_comments bc
     JOIN users u ON u.id = bc.user_id
     WHERE bc.post_slug = $1 AND bc.status = 'approved'
     ORDER BY bc.created_at ASC
     LIMIT $2 OFFSET $3`,
    [postSlug, opts.limit || 500, opts.offset || 0],
  );
  return result.rows;
}

/** Pro course access.
 *
 * This used to be an OR across a paid course enrolment and an active
 * community membership. The membership half is gone with the community,
 * and community_memberships held no rows, so no one loses access. */
export async function hasProCourseAccess(userId: number): Promise<boolean> {
  const result = await pool.query(
    "SELECT EXISTS(SELECT 1 FROM course_enrollments WHERE user_id = $1 AND tier = 'pro') AS has_pro_course",
    [userId],
  );
  return !!result.rows[0]?.has_pro_course;
}

/** Every account gets one at signup; it is the handle shown on a comment
 * and in the author box, so it outlived the forum that introduced it. */
export async function generateUniqueUsername(seed: string): Promise<string> {
  const base =
    seed
      .toLowerCase()
      .replace(/@.*/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 24) || "member";

  let candidate = base;
  let suffix = 1;
  for (;;) {
    const result = await pool.query("SELECT 1 FROM users WHERE username = $1", [candidate]);
    if (result.rowCount === 0) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}
