import { jwtVerify } from "jose";
import { pool } from "./db.js";

// Shares the main site's SESSION_SECRET so a call-session token minted by
// the Next.js app's /api/voice-agent/token route can be verified here
// without a second auth system. See src/lib/sessionSecret.ts in the main
// repo -- keep the env var name identical (SESSION_SECRET) in both
// Coolify apps.
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET);

/** Verifies a short-lived "voice-call" purpose token minted by the main
 * app. Returns { userId, email, isAdmin } or null. `isAdmin` is decided
 * once by the main app (against the same owner-email/console_admins list
 * /console login uses) and carried in the token -- this service trusts it
 * rather than re-deriving admin status itself. */
export async function verifyCallToken(token) {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== "voice-call") return null;
    if (typeof payload.userId !== "number" || typeof payload.jti !== "string") return null;
    return { userId: payload.userId, jti: payload.jti, email: payload.email, isAdmin: payload.isAdmin === true };
  } catch {
    return null;
  }
}

const SESSION_MAX_SECONDS = Number(process.env.SESSION_MAX_SECONDS || 300);

export function sessionMaxSeconds() {
  return SESSION_MAX_SECONDS;
}

/** Per-user daily quota, independent of the token-issuing route's own
 * per-day check -- this is the last line of defense if a token gets
 * reused/replayed within its short expiry window. */
export async function claimSttToken(userId, jti) {
  const result = await pool.query(
    `UPDATE voice_call_tokens
     SET stt_issued_at = now()
     WHERE jti = $1 AND user_id = $2 AND expires_at > now()
       AND stt_issued_at IS NULL
     RETURNING jti`,
    [jti, userId],
  );
  return result.rowCount === 1;
}

export async function recordSessionEnd(sessionId, durationSeconds, endReason) {
  await pool.query(
    `UPDATE voice_sessions
     SET ended_at = now(), duration_seconds = $2, end_reason = $3
     WHERE id = $1`,
    [sessionId, Math.round(durationSeconds), endReason]
  );
}

const SESSIONS_PER_USER_PER_DAY = Number(process.env.VOICE_SESSIONS_PER_USER_PER_DAY || 3);

export async function reserveSession({ userId, jti, isAdmin, ipHash }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [userId]);

    const claimed = await client.query(
      `UPDATE voice_call_tokens
       SET session_started_at = now()
       WHERE jti = $1 AND user_id = $2 AND expires_at > now()
         AND session_started_at IS NULL
       RETURNING jti`,
      [jti, userId],
    );
    if (claimed.rowCount !== 1) throw new Error("token_replayed");

    if (!isAdmin) {
      const used = await client.query(
        `SELECT count(*)::int AS n FROM voice_sessions
         WHERE user_id = $1 AND started_at > now() - interval '24 hours'`,
        [userId],
      );
      if (used.rows[0].n >= SESSIONS_PER_USER_PER_DAY) throw new Error("quota_exceeded");
    }

    const result = await client.query(
      `INSERT INTO voice_sessions (user_id, ip_hash, started_at)
       VALUES ($1, $2, now()) RETURNING id`,
      [userId, ipHash],
    );
    await client.query("COMMIT");
    return result.rows[0].id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
