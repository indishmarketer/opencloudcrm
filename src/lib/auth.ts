import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { isAuthorizedConsoleEmail } from "@/lib/consoleAdmins";
import { pool } from "@/lib/db";
import { getSessionSecret } from "@/lib/sessionSecret";
import { SITE_URL } from "@/config/brand";

const SESSION_COOKIE = "im_session";

export { getSessionSecret };
const secret = () => new TextEncoder().encode(getSessionSecret());

export type SessionPayload = {
  userId: number;
  email: string;
  sessionVersion: number;
};

export async function createSession(payload: { userId: number; email: string }) {
  const result = await pool.query("SELECT session_version FROM users WHERE id = $1", [payload.userId]);
  const sessionVersion = result.rows[0]?.session_version || 1;

  const token = await new SignJWT({ ...payload, sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const session = payload as unknown as SessionPayload;
    
    // Revocation check: verify the token's sessionVersion matches the DB.
    // Adds a DB lookup on every call, but ensures immediate invalidation
    // on password reset.
    const result = await pool.query(
      `SELECT session_version,
         (last_seen_at IS NULL OR last_seen_at < now() - interval '10 minutes') AS seen_stale
       FROM users WHERE id = $1`,
      [session.userId]
    );
    if (!result.rows[0] || result.rows[0].session_version !== session.sessionVersion) {
      return null;
    }
    if (result.rows[0].seen_stale) recordSiteActivity(session.userId);
    return session;
  } catch {
    return null;
  }
}

/** Website activity for contacts/segments ("active on the site in the last
 * 7 days"). Throttled to every 10 minutes by the caller; one
 * user_activity_days row per India day. Never blocks or fails the request. */
function recordSiteActivity(userId: number) {
  pool
    .query(
      `WITH seen AS (UPDATE users SET last_seen_at = now() WHERE id = $1 RETURNING id)
       INSERT INTO user_activity_days (user_id, day)
       SELECT id, (now() AT TIME ZONE 'Asia/Kolkata')::date FROM seen
       ON CONFLICT DO NOTHING`,
      [userId]
    )
    .catch((error) => console.error("site activity stamp failed (non-fatal):", error));
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

const ADMIN_COOKIE = "im_admin_session";
const ADMIN_MFA_PENDING_COOKIE = "im_admin_mfa_pending";

/** Console 2-step login is on unless CONSOLE_MFA=off is set in Coolify:
 * the emergency switch if an authenticator problem ever locks everyone out. */
export function consoleMfaRequired(): boolean {
  return process.env.CONSOLE_MFA !== "off";
}

/** Called once the emailed link is used: proves the inbox, not yet the
 * authenticator. Lasts 10 minutes and only unlocks /console/login/2fa. */
export async function createPendingMfaSession(email: string) {
  const token = await new SignJWT({ role: "admin-mfa-pending", email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret());
  const store = await cookies();
  store.set(ADMIN_MFA_PENDING_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
}

export async function getPendingMfaEmail(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(ADMIN_MFA_PENDING_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.role !== "admin-mfa-pending" || typeof payload.email !== "string") return null;
    return (await isAuthorizedConsoleEmail(payload.email)) ? payload.email : null;
  } catch {
    return null;
  }
}

export async function clearPendingMfaSession() {
  const store = await cookies();
  store.delete(ADMIN_MFA_PENDING_COOKIE);
}

export async function createAdminSession(email: string) {
  const token = await new SignJWT({ role: "admin", email, mfa: consoleMfaRequired() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());

  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

/** Re-validates against the current authorized-admin list on every call
 * (not just at login), so revoking someone's access takes effect on their
 * very next request instead of only blocking future magic-link requests. */
export async function getAdminSessionEmail(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.role !== "admin" || typeof payload.email !== "string") return null;
    // Sessions from before 2-step login was switched on don't count.
    if (consoleMfaRequired() && payload.mfa !== true) return null;
    const authorized = await isAuthorizedConsoleEmail(payload.email);
    return authorized ? payload.email : null;
  } catch {
    return null;
  }
}

export async function getAdminSession(): Promise<boolean> {
  return (await getAdminSessionEmail()) !== null;
}

export async function clearAdminSession() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

/** Marks a token's unique id as spent. Returns false if it was already used
 * (relies on the primary key uniqueness constraint, not a read-then-write
 * race check -- fine at this app's traffic level). Exported for the OAuth
 * authorization-code flow (src/lib/oauth.ts), which needs the exact same
 * single-use-JWT enforcement as magic links/password resets. */
export async function consumeJti(jti: string): Promise<boolean> {
  try {
    await pool.query("INSERT INTO used_auth_tokens (jti) VALUES ($1)", [jti]);
    return true;
  } catch {
    return false;
  }
}

export async function createMagicLinkToken(email: string): Promise<string> {
  return new SignJWT({ purpose: "console-magic-link", email, jti: randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret());
}

export async function verifyMagicLinkToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== "console-magic-link" || typeof payload.email !== "string") return null;
    if (typeof payload.jti !== "string" || !(await consumeJti(payload.jti))) return null;
    return payload.email;
  } catch {
    return null;
  }
}

export async function createPasswordResetToken(userId: number, email: string): Promise<string> {
  return new SignJWT({ purpose: "password-reset", userId, email, jti: randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(secret());
}

export async function verifyPasswordResetToken(
  token: string
): Promise<{ userId: number; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== "password-reset") return null;
    if (typeof payload.userId !== "number") return null;
    if (typeof payload.jti !== "string" || !(await consumeJti(payload.jti))) return null;
    return { userId: payload.userId, email: payload.email as string };
  } catch {
    return null;
  }
}

/** 24h expiry -- long enough that a slow email delivery (spam filter delay,
 * checking a different device later) doesn't strand someone, but a real
 * link, not a permanent one -- a stale unverified signup shouldn't be
 * activatable indefinitely. */
export async function createEmailVerificationToken(userId: number, email: string): Promise<string> {
  return new SignJWT({ purpose: "email-verification", userId, email, jti: randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret());
}

export async function verifyEmailVerificationToken(
  token: string
): Promise<{ userId: number; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== "email-verification" || typeof payload.userId !== "number") return null;
    if (typeof payload.jti !== "string" || !(await consumeJti(payload.jti))) return null;
    return { userId: payload.userId, email: payload.email as string };
  } catch {
    return null;
  }
}

/** Only allow same-site relative paths as a post-verification redirect --
 * this value round-trips through a query string into a signed email link,
 * never trust it as an absolute/protocol-relative URL (open redirect). */
export function safeRedirectPath(path: string | null | undefined): string {
  // Browsers treat "/\evil.com" like "//evil.com", so backslashes are out too.
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/account";
  return path;
}

/** Form POSTs that spend a sign-in token must come from our own pages. */
export function isSameOriginPost(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  return origin === SITE_URL || origin === new URL(req.url).origin;
}
