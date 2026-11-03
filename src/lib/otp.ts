import { pool } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { confirmContactDeliverable } from "@/lib/contacts";
import { SITE_URL } from "@/lib/siteMeta";
import crypto from "node:crypto";

export type OtpResult = { email: string; payload: Record<string, unknown> | null };

/** `payload` carries whatever a purpose needs to complete verification
 * independent of the browser that requested it -- e.g. the contact form's
 * name/message, so a magic link clicked from a different device/session
 * still has everything it needs. Purposes that don't need this (newsletter
 * already has its own row to update) can omit it. */
export async function requestOtp(
  email: string,
  purpose: string,
  payload?: Record<string, unknown>,
): Promise<boolean> {
  const code = String(crypto.randomInt(100000, 1000000));
  const linkToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Requesting a new code retires any still-valid older ones for the same
  // email+purpose, so only the latest code/link a user actually received
  // works -- otherwise up to 5 old codes (the rate limit) could all be
  // valid at once.
  await pool.query(
    "UPDATE otp_codes SET used = true WHERE email = $1 AND purpose = $2 AND used = false",
    [email, purpose]
  );

  await pool.query(
    "INSERT INTO otp_codes (email, code, purpose, expires_at, link_token, payload) VALUES ($1, $2, $3, $4, $5, $6)",
    [email, code, purpose, expiresAt, linkToken, payload ? JSON.stringify(payload) : null]
  );

  const tpl = await getEmailTemplate("otp-code");
  const vars = { code, magic_link_url: `${SITE_URL}/verify?token=${linkToken}` };
  const result = await sendEmail({
    to: email,
    subject: applyTemplateVars(tpl.subject, vars),
    html: applyTemplateVars(tpl.body_html, vars),
    from: tpl.from_email,
    critical: tpl.critical,
    templateKey: tpl.key,
    category: "fixed",
    trackOpens: tpl.track_opens,
  });
  // Report delivery failure to the caller so it can tell the user "we
  // couldn't email you" instead of "check your inbox" with nothing sent.
  return result.ok;
}

export async function verifyOtp(email: string, code: string, purpose: string): Promise<OtpResult | null> {
  // Atomic: the id-selecting subquery and the used=true write happen as one
  // statement, so two concurrent verifies of the same code can't both
  // "succeed" -- the second one's row lock waits for the first to commit,
  // then re-checks used=false and finds it already flipped. Consuming the
  // code here also invalidates that row's magic link (same used flag), so
  // whichever of the two the user acts on first wins.
  const result = await pool.query(
    `UPDATE otp_codes SET used = true
     WHERE id = (
       SELECT id FROM otp_codes
       WHERE email = $1 AND code = $2 AND purpose = $3 AND used = false AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1
     )
     RETURNING payload`,
    [email, code, purpose]
  );
  if (!result.rowCount) return null;
  // A correctly-entered code just proved this inbox is real and receiving
  // mail right now -- overrides any stale bounced/invalid classification.
  confirmContactDeliverable(email).catch(() => {});
  return { email, payload: result.rows[0].payload || null };
}

/** Read-only lookup for rendering the magic-link landing page -- does NOT
 * consume the token, so a link-prefetching security scanner (Microsoft
 * Defender Safe Links, Proofpoint, etc.) merely loading this page can't
 * burn it before the real user clicks the confirm button. Only the POST
 * to verify-link (via verifyOtpToken) actually consumes it. */
export async function peekOtpToken(token: string): Promise<{ email: string; purpose: string } | null> {
  const result = await pool.query(
    "SELECT email, purpose FROM otp_codes WHERE link_token = $1 AND used = false AND expires_at > now()",
    [token]
  );
  return result.rows[0] || null;
}

export async function verifyOtpToken(token: string): Promise<(OtpResult & { purpose: string }) | null> {
  const result = await pool.query(
    `UPDATE otp_codes SET used = true
     WHERE id = (
       SELECT id FROM otp_codes WHERE link_token = $1 AND used = false AND expires_at > now() LIMIT 1
     )
     RETURNING email, purpose, payload`,
    [token]
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  confirmContactDeliverable(row.email).catch(() => {});
  return { email: row.email, purpose: row.purpose, payload: row.payload || null };
}
