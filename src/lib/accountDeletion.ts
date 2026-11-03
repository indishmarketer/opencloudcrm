import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { pool, withTransaction } from "@/lib/db";
import { deleteFromR2 } from "@/lib/r2Upload";

/** Self-service "delete my account". Anonymizes the users row in place
 * instead of deleting it -- see migration 034 for why (payment_claims
 * retention, forum_posts/forum_comments staying up for other people).
 * Explicitly hard-deletes only the genuinely private stuff: DMs,
 * notifications, course progress/enrollment, community membership, and
 * any leftover OTP codes for the old email. Never touches payment_claims,
 * forum_posts, forum_comments, or review_submissions content -- those stay,
 * just now attributed to the anonymized account. */
export async function deleteOwnAccount(userId: number): Promise<void> {
  const userRow = await pool.query("SELECT email, avatar_url FROM users WHERE id = $1", [userId]);
  const user = userRow.rows[0];
  if (!user) throw new Error("Account not found.");

  const oldEmail: string = user.email;
  const unusablePasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
  const anonymizedEmail = `deleted-${userId}@deleted.invalid`;
  const anonymizedUsername = `deleted-user-${userId}`;

  await withTransaction(async (client) => {
    await client.query("UPDATE review_submissions SET user_id = NULL WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM direct_messages WHERE sender_id = $1 OR receiver_id = $1", [userId]);
    await client.query("DELETE FROM notifications WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM voice_call_tokens WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM lesson_progress WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM course_enrollments WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM community_memberships WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM otp_codes WHERE email = $1", [oldEmail]);

    // The other CRM system's trg_sync_user_contact trigger upserts
    // `contacts` on (normalized_email) whenever users.email/name changes.
    // This user's existing contacts row still holds their real user_id
    // under the OLD normalized_email; if we update users.email first, the
    // trigger's ON CONFLICT(normalized_email) finds no match for the new
    // anonymized address and tries to INSERT a second contacts row with
    // the same user_id, violating contacts_user_id_key. Retargeting the
    // existing row's normalized_email here FIRST means the trigger's
    // upsert lands on this same row instead (verified against production
    // schema before shipping).
    await client.query(
      "UPDATE contacts SET email = $1, normalized_email = $1, name = NULL WHERE user_id = $2",
      [anonymizedEmail, userId]
    );

    await client.query(
      `UPDATE users SET
        email = $1, password_hash = $2, name = NULL, interested_in = NULL,
        username = $3, avatar_url = NULL, bio = NULL, social_links = '{}'::jsonb,
        role = 'member', session_version = session_version + 1, deleted_at = now()
       WHERE id = $4`,
      [anonymizedEmail, unusablePasswordHash, anonymizedUsername, userId]
    );
  });

  if (user.avatar_url) await deleteFromR2(user.avatar_url);
}

/** Gathers everything tied to this account for a self-service data export
 * -- their own submissions/records, not other people's data (e.g. no DM
 * contents from the other side, no other members' info). */
export async function exportOwnAccountData(userId: number) {
  const [profile, enrollments, payments, forumPosts, forumComments, reviewsSubmitted, notifications] =
    await Promise.all([
      pool.query(
        "SELECT email, name, username, bio, created_at, community_points FROM users WHERE id = $1",
        [userId]
      ),
      pool.query(
        `SELECT c.title, ce.tier, ce.granted_via, ce.created_at
         FROM course_enrollments ce JOIN courses c ON c.id = ce.course_id WHERE ce.user_id = $1`,
        [userId]
      ),
      pool.query(
        "SELECT course_id, method, reference, status, amount, currency, created_at FROM payment_claims WHERE user_id = $1",
        [userId]
      ),
      pool.query(
        "SELECT title, body, status, created_at FROM forum_posts WHERE user_id = $1 ORDER BY created_at",
        [userId]
      ),
      pool.query(
        "SELECT body, status, created_at FROM forum_comments WHERE user_id = $1 ORDER BY created_at",
        [userId]
      ),
      pool.query(
        "SELECT name, role, rating, message, status, created_at FROM review_submissions WHERE user_id = $1 ORDER BY created_at",
        [userId]
      ),
      pool.query(
        "SELECT type, title, body, link, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200",
        [userId]
      ),
    ]);

  return {
    exported_at: new Date().toISOString(),
    profile: profile.rows[0] || null,
    course_enrollments: enrollments.rows,
    payment_claims: payments.rows,
    forum_posts: forumPosts.rows,
    forum_comments: forumComments.rows,
    reviews_submitted: reviewsSubmitted.rows,
    recent_notifications: notifications.rows,
  };
}
