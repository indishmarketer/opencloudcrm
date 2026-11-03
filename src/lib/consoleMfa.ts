import { pool } from "@/lib/db";
import { encryptCredential, decryptCredential } from "@/lib/secureCredential";
import { generateTotpSecret, verifyTotp, generateRecoveryCodes, hashRecoveryCode } from "@/lib/totp";

type MfaRow = {
  secret_encrypted: string;
  recovery_hashes: string[];
  enabled_at: Date | null;
  last_used_step: string | null;
};

const norm = (email: string) => email.trim().toLowerCase();

async function getRow(email: string): Promise<MfaRow | null> {
  const result = await pool.query<MfaRow>(
    "SELECT secret_encrypted, recovery_hashes, enabled_at, last_used_step FROM console_mfa WHERE email = $1",
    [norm(email)],
  );
  return result.rows[0] || null;
}

export async function getMfaStatus(email: string): Promise<{ enabled: boolean; enabledAt: Date | null; recoveryLeft: number }> {
  const row = await getRow(email);
  return { enabled: !!row?.enabled_at, enabledAt: row?.enabled_at || null, recoveryLeft: row?.recovery_hashes.length || 0 };
}

/** Secret for first-time setup. Reuses an unfinished one so reloading the
 * page doesn't invalidate a QR code that was already scanned. */
export async function getOrCreateEnrollmentSecret(email: string): Promise<string | null> {
  const row = await getRow(email);
  if (row?.enabled_at) return null;
  if (row) return decryptCredential(row.secret_encrypted);
  const secret = generateTotpSecret();
  await pool.query(
    `INSERT INTO console_mfa (email, secret_encrypted) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`,
    [norm(email), encryptCredential(secret)],
  );
  const stored = await getRow(email);
  return stored && !stored.enabled_at ? decryptCredential(stored.secret_encrypted) : null;
}

/** Finishes setup with a first valid code. Returns the recovery codes,
 * shown to the person exactly once. */
export async function confirmEnrollment(email: string, code: string): Promise<string[] | null> {
  const row = await getRow(email);
  if (!row || row.enabled_at) return null;
  const step = verifyTotp(decryptCredential(row.secret_encrypted), code, null);
  if (step == null) return null;
  const codes = generateRecoveryCodes();
  const result = await pool.query(
    `UPDATE console_mfa SET enabled_at = now(), last_used_step = $2, recovery_hashes = $3
     WHERE email = $1 AND enabled_at IS NULL`,
    [norm(email), step, codes.map(hashRecoveryCode)],
  );
  return (result.rowCount ?? 0) > 0 ? codes : null;
}

/** Checks an authenticator code, or a recovery code (which is then used
 * up). Each write is conditional, so a code can't be used twice even by
 * two requests at once. */
export async function verifyMfaCode(email: string, code: string): Promise<"totp" | "recovery" | null> {
  const row = await getRow(email);
  if (!row?.enabled_at) return null;
  const trimmed = code.trim();

  if (/^\d{6}$/.test(trimmed.replace(/\s/g, ""))) {
    const lastUsed = row.last_used_step == null ? null : Number(row.last_used_step);
    const step = verifyTotp(decryptCredential(row.secret_encrypted), trimmed, lastUsed);
    if (step == null) return null;
    const result = await pool.query(
      `UPDATE console_mfa SET last_used_step = $2 WHERE email = $1 AND (last_used_step IS NULL OR last_used_step < $2)`,
      [norm(email), step],
    );
    return (result.rowCount ?? 0) > 0 ? "totp" : null;
  }

  const hash = hashRecoveryCode(trimmed);
  const result = await pool.query(
    `UPDATE console_mfa SET recovery_hashes = array_remove(recovery_hashes, $2) WHERE email = $1 AND $2 = ANY(recovery_hashes)`,
    [norm(email), hash],
  );
  return (result.rowCount ?? 0) > 0 ? "recovery" : null;
}

export async function regenerateRecoveryCodes(email: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await pool.query("UPDATE console_mfa SET recovery_hashes = $2 WHERE email = $1 AND enabled_at IS NOT NULL", [
    norm(email),
    codes.map(hashRecoveryCode),
  ]);
  return codes;
}

/** Removes someone's authenticator so their next login sets up a new one. */
export async function resetMfa(email: string): Promise<void> {
  await pool.query("DELETE FROM console_mfa WHERE email = $1", [norm(email)]);
}
