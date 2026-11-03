import { pool } from "@/lib/db";
import { isConsoleOwner } from "@/lib/consoleAdmins";
import { canWatchWebinar } from "@/lib/webinarGate";

export type WebinarStatus = "draft" | "processing" | "ready" | "errored" | "published" | "archived";
export type WebinarAccessTier = "free" | "pro";

export type Webinar = {
  id: number;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  thumbnail_url: string | null;
  presenter_name: string | null;
  presenter_title: string | null;
  presenter_bio: string | null;
  presenter_image_url: string | null;
  audience: string | null;
  key_takeaways: string[];
  agenda: Array<{ title: string; description: string }>;
  cta_label: string | null;
  cta_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  featured: boolean;
  mux_upload_id: string | null;
  mux_asset_id: string | null;
  mux_playback_id: string | null;
  pending_mux_upload_id: string | null;
  pending_mux_asset_id: string | null;
  pending_mux_passthrough: string | null;
  status: WebinarStatus;
  duration_seconds: number | null;
  access_tier: WebinarAccessTier;
  release_at: string | null;
  requires_registration: boolean;
  created_at: string;
  updated_at: string;
};

export type WebinarComment = {
  id: number;
  webinar_id: number;
  user_id: number;
  parent_comment_id: number | null;
  body: string;
  is_question: boolean;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  author_name: string | null;
  author_username: string | null;
  author_avatar_url: string | null;
};

export async function getWebinarBySlug(slug: string): Promise<Webinar | null> {
  const result = await pool.query<Webinar>("SELECT * FROM webinars WHERE slug = $1", [slug]);
  return result.rows[0] || null;
}

export async function getWebinarById(id: number): Promise<Webinar | null> {
  const result = await pool.query<Webinar>("SELECT * FROM webinars WHERE id = $1", [id]);
  return result.rows[0] || null;
}

export async function listPublishedWebinars(): Promise<Webinar[]> {
  const result = await pool.query<Webinar>(
    "SELECT * FROM webinars WHERE status = 'published' ORDER BY featured DESC, COALESCE(release_at, created_at) DESC, created_at DESC",
  );
  return result.rows;
}

export async function listAllWebinars(): Promise<Webinar[]> {
  const result = await pool.query<Webinar>("SELECT * FROM webinars ORDER BY updated_at DESC");
  return result.rows;
}

export async function hasWebinarAccess(userId: number, webinarId: number): Promise<boolean> {
  const r = await pool.query("SELECT 1 FROM webinar_access WHERE user_id = $1 AND webinar_id = $2", [userId, webinarId]);
  return (r.rowCount ?? 0) > 0;
}

export async function isOwnerByUserId(userId: number): Promise<boolean> {
  const r = await pool.query("SELECT email FROM users WHERE id = $1", [userId]);
  const email = r.rows[0]?.email || "";
  return isConsoleOwner(email);
}

export { canWatchWebinar, isReleasePending } from "@/lib/webinarGate";
export type { WatchGateInput, WatchGateResult } from "@/lib/webinarGate";

// Comments helpers (mirrors listCourseComments but for webinars, with is_question + moderation-aware)
export async function listWebinarComments(
  webinarId: number,
  opts: { viewerUserId?: number; viewerIsModerator?: boolean; occurrenceSessionStartAt?: string | Date | null } = {},
): Promise<WebinarComment[]> {
  let visibility = "wc.status = 'approved'";
  const params: (number | string)[] = [webinarId];
  if (opts.viewerIsModerator) {
    visibility = "TRUE";
  } else if (opts.viewerUserId) {
    params.push(opts.viewerUserId);
    visibility = `(wc.status = 'approved' OR wc.user_id = $${params.length})`;
  }
  // Scopes to one simulated-live broadcast occurrence -- without this, every
  // attendee across every past/future broadcast date shares the same feed.
  let occurrenceClause = "";
  if (opts.occurrenceSessionStartAt) {
    params.push(new Date(opts.occurrenceSessionStartAt).toISOString());
    occurrenceClause = ` AND wc.session_start_at = $${params.length}`;
  }
  const result = await pool.query(
    `SELECT wc.*, u.name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar_url
     FROM webinar_comments wc
     JOIN users u ON u.id = wc.user_id
     WHERE wc.webinar_id = $1 AND ${visibility}${occurrenceClause}
     ORDER BY wc.created_at ASC
     LIMIT 500`,
    params,
  );
  return result.rows;
}

export async function canCommentOnWebinar(userId: number, webinarId: number): Promise<boolean> {
  const webinar = await getWebinarById(webinarId);
  if (!webinar) return false;
  // published/ready gating: only those who can watch can comment; reuse watch gate without pro/registration strictness?
  // For now allow anyone who is entitled to view (published) to comment; require registration if webinar requires it.
  const hasRegistered = webinar.requires_registration ? await hasWebinarAccess(userId, webinarId) : true;
  const isOwner = await isOwnerByUserId(userId);
  // For comments, treat hasProAccess based on pro course/membership; owner always true.
  let hasProAccess = false;
  if (webinar.access_tier === "pro" && !isOwner) {
    // Cheap check: reuse community pro access (course_enrollments pro OR community_memberships)
    const r = await pool.query(
      `SELECT EXISTS(SELECT 1 FROM course_enrollments WHERE user_id = $1 AND tier = 'pro') AS has_pro_course,
              EXISTS(SELECT 1 FROM community_memberships WHERE user_id = $1 AND status = 'active' AND (current_period_end IS NULL OR current_period_end > now())) AS has_membership`,
      [userId],
    );
    hasProAccess = !!(r.rows[0]?.has_pro_course || r.rows[0]?.has_membership);
  } else {
    hasProAccess = true;
  }
  const gate = canWatchWebinar({ webinar, isOwner, hasRegistered, hasProAccess });
  return gate.allowed;
}
