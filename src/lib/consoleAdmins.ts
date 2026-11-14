import { pool } from "@/lib/db";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { SITE_URL } from "@/lib/liveSiteUrl";

export type ConsoleAdmin = { id: number; email: string; invited_by: string | null; created_at: string };

/** The one true owner. Never stored in the DB, never removable, defined
 * only by the ADMIN_EMAIL env var. */
export function isConsoleOwner(email: string): boolean {
  const ownerEmail = process.env.ADMIN_EMAIL;
  return !!ownerEmail && email.toLowerCase() === ownerEmail.toLowerCase();
}

/** Owner, or an invited admin currently in console_admins. Re-checked on
 * every session validation (not just at login), so removing someone
 * revokes their access immediately instead of only blocking future logins. */
export async function isAuthorizedConsoleEmail(email: string): Promise<boolean> {
  if (isConsoleOwner(email)) return true;
  const result = await pool.query("SELECT 1 FROM console_admins WHERE email = $1", [email.toLowerCase()]);
  return (result.rowCount ?? 0) > 0;
}

export async function listConsoleAdmins(): Promise<ConsoleAdmin[]> {
  const result = await pool.query(
    "SELECT id, email, invited_by, created_at FROM console_admins ORDER BY created_at"
  );
  return result.rows;
}

export async function inviteConsoleAdmin(
  email: string,
  invitedBy: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return { ok: false, error: "Enter a valid email." };
  if (isConsoleOwner(normalized)) return { ok: false, error: "That's already the owner account." };

  await pool.query(
    "INSERT INTO console_admins (email, invited_by) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING",
    [normalized, invitedBy]
  );

  // Real, self-built automation now (trigger "Console admin invited") --
  // no direct send. The DB row above is the actual access grant -- an
  // invite with no email sent is still a real invite; the new admin can
  // request their own console login link to get in (see magic-link-login).
  emitWebhookEvent({
    eventType: "console_admin.invited",
    source: "console_admins",
    sourceRecordId: normalized,
    contactEmail: normalized,
    data: { invited_by: invitedBy, login_url: `${SITE_URL}/console/login` },
  }).catch(() => {});

  return { ok: true };
}

export async function removeConsoleAdmin(email: string): Promise<void> {
  await pool.query("DELETE FROM console_admins WHERE email = $1", [email.trim().toLowerCase()]);
}
