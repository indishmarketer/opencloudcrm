import { pool } from "@/lib/db";

export type Space = "general" | "pro";
export type PostStatus = "pending" | "approved" | "rejected";

export type Category = {
  id: number;
  space: Space;
  name: string;
  slug: string;
  description: string | null;
  position: number;
};

export type Post = {
  id: number;
  space: Space;
  category_id: number | null;
  category_name: string | null;
  user_id: number;
  author_name: string | null;
  author_username: string | null;
  author_avatar_url: string | null;
  author_community_points?: number;
  title: string;
  body: string;
  status: PostStatus;
  pinned: boolean;
  comment_count: number;
  like_count: number;
  user_liked: boolean;
  created_at: string;
};

export type Comment = {
  id: number;
  post_id: number;
  user_id: number;
  author_name: string | null;
  author_username: string | null;
  author_avatar_url: string | null;
  author_community_points?: number;
  parent_comment_id: number | null;
  body: string;
  status: PostStatus;
  created_at: string;
};

export type Profile = {
  id: number;
  username: string | null;
  name: string | null;
  email: string;
  avatar_url: string | null;
  bio: string | null;
  social_links: Record<string, string>;
  role: "member" | "moderator";
  community_points: number;
  created_at: string;
};

export type BlogComment = {
  id: number;
  post_slug: string;
  user_id: number;
  author_name: string | null;
  author_username: string | null;
  author_avatar_url: string | null;
  author_community_points?: number;
  parent_comment_id: number | null;
  body: string;
  status: PostStatus;
  created_at: string;
};

export async function getCategories(space: Space): Promise<Category[]> {
  const result = await pool.query(
    "SELECT * FROM community_categories WHERE space = $1 ORDER BY position, name",
    [space]
  );
  return result.rows;
}

export async function listPosts(
  space: Space,
  opts: { categorySlug?: string; viewerUserId?: number; viewerIsModerator?: boolean; limit?: number; offset?: number } = {}
): Promise<Post[]> {
  // Pending posts are only visible to their author and moderators -- everyone
  // else only ever sees approved (or rejected, so an author can see why).
  const params: (string | number)[] = [space];
  let categoryClause = "";
  if (opts.categorySlug) {
    params.push(opts.categorySlug);
    categoryClause = `AND cc.slug = $${params.length}`;
  }

  let viewerUserIdIndex: number | null = null;
  if (opts.viewerUserId) {
    params.push(opts.viewerUserId);
    viewerUserIdIndex = params.length;
  }

  let visibility = "fp.status = 'approved'";
  if (opts.viewerIsModerator) {
    visibility = "TRUE";
  } else if (viewerUserIdIndex) {
    visibility = `(fp.status = 'approved' OR fp.user_id = $${viewerUserIdIndex})`;
  }

  const result = await pool.query(
    `SELECT fp.*, cc.name AS category_name, u.name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar_url, u.community_points AS author_community_points,
       COALESCE(comment_counts.count, 0)::int AS comment_count,
       COALESCE(like_counts.count, 0)::int AS like_count,
       ${viewerUserIdIndex ? `EXISTS(SELECT 1 FROM forum_post_likes fpl WHERE fpl.post_id = fp.id AND fpl.user_id = $${viewerUserIdIndex})` : 'false'} AS user_liked
     FROM forum_posts fp
     LEFT JOIN community_categories cc ON cc.id = fp.category_id
     JOIN users u ON u.id = fp.user_id
     LEFT JOIN (
       SELECT post_id, COUNT(*) as count 
       FROM forum_comments 
       WHERE status = 'approved' 
       GROUP BY post_id
     ) comment_counts ON comment_counts.post_id = fp.id
     LEFT JOIN (
       SELECT post_id, COUNT(*) as count 
       FROM forum_post_likes 
       GROUP BY post_id
     ) like_counts ON like_counts.post_id = fp.id
     WHERE fp.space = $1 AND ${visibility} ${categoryClause}
     ORDER BY fp.pinned DESC, fp.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, opts.limit || 50, opts.offset || 0]
  );
  return result.rows;
}

export async function getPost(postId: number, viewerUserId?: number): Promise<Post | null> {
  const params: (string | number)[] = [postId];
  let userLikedSelect = 'false';
  if (viewerUserId) {
    params.push(viewerUserId);
    userLikedSelect = `EXISTS(SELECT 1 FROM forum_post_likes fpl WHERE fpl.post_id = fp.id AND fpl.user_id = $2)`;
  }

  const result = await pool.query(
    `SELECT fp.*, cc.name AS category_name, u.name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar_url, u.community_points AS author_community_points,
       (SELECT COUNT(*) FROM forum_comments fc WHERE fc.post_id = fp.id AND fc.status = 'approved')::int AS comment_count,
       (SELECT COUNT(*) FROM forum_post_likes fpl WHERE fpl.post_id = fp.id)::int AS like_count,
       ${userLikedSelect} AS user_liked
     FROM forum_posts fp
     LEFT JOIN community_categories cc ON cc.id = fp.category_id
     JOIN users u ON u.id = fp.user_id
     WHERE fp.id = $1`,
    params
  );
  return result.rows[0] || null;
}

export async function listComments(
  postId: number,
  opts: { viewerUserId?: number; viewerIsModerator?: boolean; limit?: number; offset?: number } = {}
): Promise<Comment[]> {
  const params: (string | number)[] = [postId];
  let visibility = "fc.status = 'approved'";
  if (opts.viewerIsModerator) {
    visibility = "TRUE";
  } else if (opts.viewerUserId) {
    params.push(opts.viewerUserId);
    visibility = `(fc.status = 'approved' OR fc.user_id = $${params.length})`;
  }

  const result = await pool.query(
    `SELECT fc.*, u.name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar_url, u.community_points AS author_community_points
     FROM forum_comments fc
     JOIN users u ON u.id = fc.user_id
     WHERE fc.post_id = $1 AND ${visibility}
     ORDER BY fc.created_at ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, opts.limit || 500, opts.offset || 0]
  );
  return result.rows;
}

export async function getProfileByUsername(username: string): Promise<Profile | null> {
  const result = await pool.query(
    `SELECT id, username, name, email, avatar_url, bio, social_links, role, community_points, created_at
     FROM users WHERE username = $1`,
    [username]
  );
  return result.rows[0] || null;
}

export async function getProfileById(userId: number): Promise<Profile | null> {
  const result = await pool.query(
    `SELECT id, username, name, email, avatar_url, bio, social_links, role, community_points, created_at
     FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function listBlogComments(postSlug: string, opts: { limit?: number; offset?: number } = {}): Promise<BlogComment[]> {
  const result = await pool.query(
    `SELECT bc.*, u.name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar_url
     FROM blog_comments bc
     JOIN users u ON u.id = bc.user_id
     WHERE bc.post_slug = $1 AND bc.status = 'approved'
     ORDER BY bc.created_at ASC
     LIMIT $2 OFFSET $3`,
    [postSlug, opts.limit || 500, opts.offset || 0]
  );
  return result.rows;
}

export async function isModeratorOrAdmin(userId: number): Promise<boolean> {
  const result = await pool.query("SELECT role, email FROM users WHERE id = $1", [userId]);
  const user = result.rows[0];
  if (!user) return false;
  if (user.role === "moderator") return true;
  const adminEmail = process.env.ADMIN_EMAIL;
  return !!adminEmail && user.email === adminEmail;
}

export async function isBanned(userId: number): Promise<boolean> {
  const result = await pool.query("SELECT 1 FROM community_bans WHERE user_id = $1", [userId]);
  return (result.rowCount ?? 0) > 0;
}

export type BannedMember = {
  user_id: number;
  username: string | null;
  name: string | null;
  reason: string | null;
  banned_by_name: string | null;
  created_at: string;
};

export async function listBans(): Promise<BannedMember[]> {
  const result = await pool.query(
    `SELECT cb.user_id, u.username, u.name, cb.reason, cb.created_at, bb.name AS banned_by_name
     FROM community_bans cb
     JOIN users u ON u.id = cb.user_id
     LEFT JOIN users bb ON bb.id = cb.banned_by
     ORDER BY cb.created_at DESC`
  );
  return result.rows;
}

/** `bannedBy` is null when the ban came from a console admin with no site
 * account of their own; community_bans.banned_by is nullable for exactly
 * that case. */
export async function banUserByUsername(
  username: string,
  bannedBy: number | null,
  reason: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userResult = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
  const target = userResult.rows[0];
  if (!target) return { ok: false, error: "No member with that username." };
  if (bannedBy !== null && target.id === bannedBy) return { ok: false, error: "You can't ban yourself." };

  await pool.query(
    `INSERT INTO community_bans (user_id, banned_by, reason) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET banned_by = $2, reason = $3, created_at = now()`,
    [target.id, bannedBy, reason]
  );
  return { ok: true };
}

export async function unbanUser(userId: number): Promise<void> {
  await pool.query("DELETE FROM community_bans WHERE user_id = $1", [userId]);
}

export type SpaceSettings = {
  space: Space;
  auto_approve_posts: boolean;
  auto_approve_comments: boolean;
};

export async function listSpaceSettings(): Promise<SpaceSettings[]> {
  const result = await pool.query(
    "SELECT space, auto_approve_posts, auto_approve_comments FROM community_settings ORDER BY space"
  );
  return result.rows;
}

export async function updateSpaceSettings(
  space: Space,
  updates: { auto_approve_posts?: boolean; auto_approve_comments?: boolean }
): Promise<void> {
  await pool.query(
    `UPDATE community_settings
     SET auto_approve_posts = COALESCE($2, auto_approve_posts),
         auto_approve_comments = COALESCE($3, auto_approve_comments),
         updated_at = now()
     WHERE space = $1`,
    [space, updates.auto_approve_posts ?? null, updates.auto_approve_comments ?? null]
  );
}

export async function listPendingPosts(): Promise<Post[]> {
  const result = await pool.query(
    `SELECT fp.*, cc.name AS category_name, u.name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar_url, 0 AS comment_count
     FROM forum_posts fp
     LEFT JOIN community_categories cc ON cc.id = fp.category_id
     JOIN users u ON u.id = fp.user_id
     WHERE fp.status = 'pending'
     ORDER BY fp.created_at ASC`
  );
  return result.rows;
}

export type PendingComment = Comment & { post_title: string; space: Space };

export async function listPendingComments(): Promise<PendingComment[]> {
  const result = await pool.query(
    `SELECT fc.*, u.name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar_url, fp.title AS post_title, fp.space
     FROM forum_comments fc
     JOIN users u ON u.id = fc.user_id
     JOIN forum_posts fp ON fp.id = fc.post_id
     WHERE fc.status = 'pending'
     ORDER BY fc.created_at ASC`
  );
  return result.rows;
}

export async function moderatePost(
  postId: number,
  approve: boolean
): Promise<{ userId: number; title: string; space: Space } | null> {
  const result = await pool.query(
    "UPDATE forum_posts SET status = $2 WHERE id = $1 AND status = 'pending' RETURNING user_id, title, space",
    [postId, approve ? "approved" : "rejected"]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (approve) {
    await pool.query("UPDATE users SET community_points = community_points + 3 WHERE id = $1", [row.user_id]);
  }
  return { userId: row.user_id, title: row.title, space: row.space };
}

export async function moderateComment(commentId: number, approve: boolean): Promise<void> {
  const result = await pool.query(
    "UPDATE forum_comments SET status = $2 WHERE id = $1 AND status = 'pending' RETURNING user_id",
    [commentId, approve ? "approved" : "rejected"]
  );
  if (approve && result.rows[0]) {
    await pool.query("UPDATE users SET community_points = community_points + 1 WHERE id = $1", [
      result.rows[0].user_id,
    ]);
  }
}

export async function setModerator(
  username: string,
  isModerator: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await pool.query(
    "UPDATE users SET role = $2 WHERE username = $1 RETURNING id",
    [username, isModerator ? "moderator" : "member"]
  );
  if (result.rowCount === 0) return { ok: false, error: "No member with that username." };
  return { ok: true };
}

export type ModeratorProfile = { id: number; username: string | null; name: string | null; email: string };

export async function listModerators(): Promise<ModeratorProfile[]> {
  const result = await pool.query(
    "SELECT id, username, name, email FROM users WHERE role = 'moderator' ORDER BY name"
  );
  return result.rows;
}

/** Whether a user can access the PRO forum. Checks per-course 'pro' tier
 * today; ORs in an active community_memberships row so a future site-wide
 * subscription product can grant the same access without touching any
 * call site of this function. */
export async function getUserProAccess(userId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT
       EXISTS(SELECT 1 FROM course_enrollments WHERE user_id = $1 AND tier = 'pro') AS has_pro_course,
       EXISTS(
         SELECT 1 FROM community_memberships
         WHERE user_id = $1 AND status = 'active' AND (current_period_end IS NULL OR current_period_end > now())
       ) AS has_membership`,
    [userId]
  );
  const row = result.rows[0];
  return !!(row?.has_pro_course || row?.has_membership);
}

export async function getSpaceAbout(space: Space): Promise<string | null> {
  const result = await pool.query("SELECT about_text FROM community_settings WHERE space = $1", [space]);
  return result.rows[0]?.about_text ?? null;
}

export type TopMember = {
  id: number;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  activity_count: number;
};

/** Ranks members by activity within one space (approved posts + comments
 * there), not by the site-wide community_points total -- points accrue
 * across both spaces, so a global ranking would show the same people in
 * both General's and PRO's sidebars. */
export async function listTopMembers(space: Space, limit = 5): Promise<TopMember[]> {
  const result = await pool.query(
    `SELECT u.id, u.username, u.name, u.avatar_url, COUNT(*)::int AS activity_count
     FROM users u
     JOIN (
       SELECT user_id FROM forum_posts WHERE space = $1 AND status = 'approved'
       UNION ALL
       SELECT fc.user_id FROM forum_comments fc JOIN forum_posts fp ON fp.id = fc.post_id
       WHERE fp.space = $1 AND fc.status = 'approved'
     ) activity ON activity.user_id = u.id
     GROUP BY u.id
     ORDER BY activity_count DESC
     LIMIT $2`,
    [space, limit]
  );
  return result.rows;
}

export async function getMemberCount(space: Space): Promise<number> {
  if (space === "pro") {
    const result = await pool.query(
      `SELECT COUNT(DISTINCT user_id)::int AS count FROM (
         SELECT user_id FROM course_enrollments WHERE tier = 'pro'
         UNION
         SELECT user_id FROM community_memberships
         WHERE status = 'active' AND (current_period_end IS NULL OR current_period_end > now())
       ) x`
    );
    return result.rows[0].count;
  }
  const result = await pool.query("SELECT COUNT(*)::int AS count FROM users");
  return result.rows[0].count;
}

export type ProfileStats = {
  courses: { slug: string; title: string; tier: "free" | "pro" }[];
  hasProAccess: boolean;
  postCount: number;
  commentCount: number;
};

/** Pulls together what one account has done across the site, courses
 * enrolled, forum activity, PRO access, into a single view. This is the
 * "sync" the owner asked for: one account already backs all of it (same
 * users table, same session), this just surfaces that in one place rather
 * than requiring a data-model merge. */
export async function getProfileStats(userId: number): Promise<ProfileStats> {
  const [coursesResult, postCountResult, commentCountResult, proAccess] = await Promise.all([
    pool.query(
      `SELECT c.slug, c.title, ce.tier FROM course_enrollments ce
       JOIN courses c ON c.id = ce.course_id
       WHERE ce.user_id = $1 ORDER BY c.title`,
      [userId]
    ),
    pool.query("SELECT COUNT(*)::int AS count FROM forum_posts WHERE user_id = $1 AND status = 'approved'", [
      userId,
    ]),
    pool.query("SELECT COUNT(*)::int AS count FROM forum_comments WHERE user_id = $1 AND status = 'approved'", [
      userId,
    ]),
    getUserProAccess(userId),
  ]);

  return {
    courses: coursesResult.rows,
    hasProAccess: proAccess,
    postCount: postCountResult.rows[0].count,
    commentCount: commentCountResult.rows[0].count,
  };
}

export type MemberSummary = {
  id: number;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  role: "member" | "moderator";
  community_points: number;
  has_pro_access: boolean;
};

export async function listMembers(limit = 200): Promise<MemberSummary[]> {
  const result = await pool.query(
    `SELECT u.id, u.username, u.name, u.avatar_url, u.role, u.community_points,
       (
         EXISTS(SELECT 1 FROM course_enrollments ce WHERE ce.user_id = u.id AND ce.tier = 'pro')
         OR EXISTS(
           SELECT 1 FROM community_memberships cm
           WHERE cm.user_id = u.id AND cm.status = 'active'
             AND (cm.current_period_end IS NULL OR cm.current_period_end > now())
         )
       ) AS has_pro_access
     FROM users u
     WHERE u.id NOT IN (SELECT user_id FROM community_bans)
     ORDER BY u.community_points DESC, u.name NULLS LAST, u.id
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/** Every account needs a username the moment it's created so its profile
 * is reachable everywhere it's mentioned (posts, comments, members list)
 * instead of only after someone manually sets one in settings. Derives a
 * slug from a name or email, then appends -2, -3, etc. on collision. */
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

/** The one ADMIN_EMAIL account, wherever it's linked from (blog author
 * box, course trainer bio), so those links point at the real community
 * username instead of a hardcoded guess. Returns null if that account
 * doesn't exist yet or hasn't got a username (pre-backfill). */
export async function getSiteOwnerProfile(): Promise<Profile | null> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return null;
  const result = await pool.query(
    `SELECT id, username, name, email, avatar_url, bio, social_links, role, community_points, created_at
     FROM users WHERE email = $1`,
    [adminEmail]
  );
  return result.rows[0] || null;
}

const USERNAME_RE = /^[a-z0-9][a-z0-9-]{1,29}$/;
const RESERVED_USERNAMES = new Set(["general", "pro", "admin", "settings", "leaderboard", "about", "invite", "members"]);

/** Moderator/admin-only: rename any member's username. Same validation as
 * the self-service profile form. */
export async function adminSetUsername(
  currentUsername: string,
  newUsername: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!USERNAME_RE.test(newUsername)) {
    return { ok: false, error: "Username must be 2-30 characters: lowercase letters, numbers, and hyphens only." };
  }
  if (RESERVED_USERNAMES.has(newUsername)) {
    return { ok: false, error: "That username is reserved." };
  }

  const target = await pool.query("SELECT id FROM users WHERE username = $1", [currentUsername]);
  if (target.rows.length === 0) return { ok: false, error: "No member with that username." };

  const clash = await pool.query("SELECT id FROM users WHERE username = $1", [newUsername]);
  if (clash.rows.length > 0) return { ok: false, error: "That username is already taken." };

  await pool.query("UPDATE users SET username = $1 WHERE id = $2", [newUsername, target.rows[0].id]);
  return { ok: true };
}

export async function togglePostLike(
  postId: number,
  userId: number,
  like: boolean
): Promise<{ userId: number; title: string; space: Space } | null> {
  if (like) {
    const res = await pool.query(
      "INSERT INTO forum_post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [postId, userId]
    );
    if ((res.rowCount ?? 0) > 0) {
      await pool.query(
        "UPDATE users SET community_points = community_points + 1 WHERE id = (SELECT user_id FROM forum_posts WHERE id = $1)",
        [postId]
      );
      const post = await pool.query("SELECT user_id, title, space FROM forum_posts WHERE id = $1", [postId]);
      const row = post.rows[0];
      return row ? { userId: row.user_id, title: row.title, space: row.space } : null;
    }
    return null;
  } else {
    const res = await pool.query(
      "DELETE FROM forum_post_likes WHERE post_id = $1 AND user_id = $2",
      [postId, userId]
    );
    if ((res.rowCount ?? 0) > 0) {
      await pool.query(
        "UPDATE users SET community_points = GREATEST(0, community_points - 1) WHERE id = (SELECT user_id FROM forum_posts WHERE id = $1)",
        [postId]
      );
    }
    return null;
  }
}

export type LeaderboardEntry = {
  id: number;
  username: string;
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: "member" | "moderator";
  community_points: number;
  period_points: number;
};

export async function getLeaderboard(period: "7d" | "30d" | "all" = "all", limit = 50): Promise<LeaderboardEntry[]> {
  if (period === "all") {
    const result = await pool.query(
      `SELECT id, username, name, avatar_url, bio, role, community_points, community_points as period_points
       FROM users
       WHERE username IS NOT NULL AND id NOT IN (SELECT user_id FROM community_bans)
       ORDER BY community_points DESC, id ASC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  const days = period === "7d" ? 7 : 30;
  const result = await pool.query(
    `WITH period_activity AS (
       SELECT user_id, 3 as pts FROM forum_posts WHERE status = 'approved' AND created_at >= now() - ($1 || ' days')::INTERVAL
       UNION ALL
       SELECT user_id, 1 as pts FROM forum_comments WHERE status = 'approved' AND created_at >= now() - ($1 || ' days')::INTERVAL
       UNION ALL
       SELECT fp.user_id, 1 as pts FROM forum_post_likes fpl JOIN forum_posts fp ON fp.id = fpl.post_id WHERE fpl.created_at >= now() - ($1 || ' days')::INTERVAL
     )
     SELECT u.id, u.username, u.name, u.avatar_url, u.bio, u.role, u.community_points, COALESCE(SUM(pa.pts), 0)::int as period_points
     FROM users u
     JOIN period_activity pa ON pa.user_id = u.id
     WHERE u.username IS NOT NULL AND u.id NOT IN (SELECT user_id FROM community_bans)
     GROUP BY u.id, u.username, u.name, u.avatar_url, u.bio, u.role, u.community_points
     ORDER BY period_points DESC, u.community_points DESC
     LIMIT $2`,
    [days.toString(), limit]
  );
  return result.rows;
}

export async function getInviteStats(userId: number): Promise<{ invitedCount: number; pointsEarned: number }> {
  try {
    const result = await pool.query(
      "SELECT COUNT(*)::int as count FROM users WHERE referred_by = $1",
      [userId]
    );
    const count = result.rows[0]?.count || 0;
    return { invitedCount: count, pointsEarned: count * 10 };
  } catch {
    return { invitedCount: 0, pointsEarned: 0 };
  }
}
