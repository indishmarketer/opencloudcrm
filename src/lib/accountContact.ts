import crypto from "node:crypto";
import { pool } from "@/lib/db";
import { ensureContact } from "@/lib/contacts";

/**
 * Changing the email address or the phone number on an account, with the
 * change proved before it takes effect.
 *
 * The rule both flows follow: **the new contact detail is confirmed, not
 * the old one.** Confirming the old address would prove nothing, since
 * whoever is signed in already controls it. Sending to the new one proves
 * the person actually holds what they are claiming, and it means somebody
 * who gets into an account cannot swap the address to one they own and
 * lock the real owner out, because the old address keeps working until the
 * new one answers.
 *
 * Nothing here stores the secret. The token and the code are kept as
 * SHA-256 hashes, so a leak of these tables cannot be replayed, matching
 * how password reset already works.
 */

const EMAIL_TOKEN_TTL_MINUTES = 60;
const PHONE_CODE_TTL_MINUTES = 10;
const MAX_PHONE_ATTEMPTS = 5;

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/* ------------------------------ email ------------------------------ */

/** Starts an email change. Returns the raw token to put in the link; it is
 * never stored and never logged. */
export async function startEmailChange(userId: number, newEmail: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  // Any earlier unused request is dropped, so a person who mistypes an
  // address cannot leave a live link pointing at it.
  await pool.query(
    "UPDATE account_email_changes SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL",
    [userId],
  );
  await pool.query(
    `INSERT INTO account_email_changes (user_id, new_email, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [userId, newEmail, hash(token), String(EMAIL_TOKEN_TTL_MINUTES)],
  );
  return token;
}

export type EmailChangeResult =
  | { ok: true; userId: number; email: string }
  | { ok: false; reason: string };

/**
 * Applies a confirmed email change.
 *
 * The whole thing is one transaction, and the row is claimed with a
 * conditional UPDATE rather than a SELECT then UPDATE, so two clicks on the
 * same link cannot both pass. If the address was taken in the meantime the
 * transaction rolls back and the old address is untouched.
 */
export async function confirmEmailChange(token: string): Promise<EmailChangeResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claimed = await client.query<{ user_id: number; new_email: string }>(
      `UPDATE account_email_changes
       SET consumed_at = now()
       WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
       RETURNING user_id, new_email`,
      [hash(token)],
    );
    const row = claimed.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "That link has already been used or has expired." };
    }

    const taken = await client.query("SELECT 1 FROM users WHERE lower(email) = lower($1) AND id <> $2", [
      row.new_email,
      row.user_id,
    ]);
    if (taken.rows.length > 0) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "That email address now belongs to another account." };
    }

    await client.query(
      // email_verified_at is set in the same breath: they just proved it by
      // opening a link we sent there, which is exactly what verification is.
      // session_version is bumped so other sessions are signed out, because
      // an email change is the point at which you want a stolen session
      // gone.
      `UPDATE users
       SET email = $2, email_verified_at = now(), session_version = session_version + 1
       WHERE id = $1`,
      [row.user_id, row.new_email],
    );
    await client.query("COMMIT");
    return { ok: true, userId: row.user_id, email: row.new_email };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/* ------------------------------ phone ------------------------------ */

/** Six digits, generated with the crypto RNG rather than Math.random, and
 * left zero padded so every code is the same length. */
export function generatePhoneCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function startPhoneVerification(userId: number, phone: string, code: string): Promise<void> {
  await pool.query(
    "UPDATE account_phone_verifications SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL",
    [userId],
  );
  await pool.query(
    `INSERT INTO account_phone_verifications (user_id, phone, code_hash, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [userId, phone, hash(code), String(PHONE_CODE_TTL_MINUTES)],
  );
}

export type PhoneVerifyResult = { ok: true; phone: string } | { ok: false; reason: string };

/**
 * Checks a code against the newest open request.
 *
 * The attempt counter goes up before the comparison, so a wrong guess costs
 * an attempt whatever happens next, and the row is burned at the limit.
 * Without that a six digit code sitting valid for ten minutes is a few
 * thousand requests away from being guessed.
 */
export async function confirmPhoneVerification(
  userId: number,
  email: string,
  code: string,
): Promise<PhoneVerifyResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const open = await client.query<{ id: string; phone: string; code_hash: string; attempts: number }>(
      `SELECT id, phone, code_hash, attempts
       FROM account_phone_verifications
       WHERE user_id = $1 AND consumed_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [userId],
    );
    const row = open.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "That code has expired. Ask for a new one." };
    }

    const actualHash = Buffer.from(hash(code), "hex");
    const expectedHash = Buffer.from(row.code_hash, "hex");
    const matches = actualHash.length === expectedHash.length && crypto.timingSafeEqual(actualHash, expectedHash);
    const attempts = row.attempts + 1;
    if (!matches) {
      await client.query(
        attempts >= MAX_PHONE_ATTEMPTS
          ? "UPDATE account_phone_verifications SET attempts = $2, consumed_at = now() WHERE id = $1"
          : "UPDATE account_phone_verifications SET attempts = $2 WHERE id = $1",
        [row.id, attempts],
      );
      await client.query("COMMIT");
      return {
        ok: false,
        reason: attempts >= MAX_PHONE_ATTEMPTS ? "Too many wrong codes. Ask for a new one." : "That code is not right.",
      };
    }

    // The contact write and OTP consumption are one transaction. A database
    // error therefore leaves the code usable instead of stranding the user.
    const contactId = await ensureContact({ email, userId, phone: row.phone, phoneSource: "self" }, client);
    await client.query("UPDATE contacts SET phone_verified_at = now() WHERE id = $1", [contactId]);
    await client.query("UPDATE account_phone_verifications SET consumed_at = now(), attempts = $2 WHERE id = $1", [row.id, attempts]);
    await client.query("COMMIT");
    return { ok: true, phone: row.phone };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
