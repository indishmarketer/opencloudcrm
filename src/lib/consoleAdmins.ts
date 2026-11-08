import { pool } from "@/lib/db";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { escapeHtml } from "@/lib/escapeHtml";
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

  // Fire-and-forget: the invite itself (the DB row, which is what actually
  // grants access) is already committed. Don't make the owner's UI sit
  // waiting on an external email API before showing the new row.
  //
  // Dynamic import, not a top-level one: email.ts pulls in auth.ts (for the
  // unsubscribe/open-tracking token helpers), which imports next/headers --
  // a Next.js-runtime-only export that plain `node --test` can't resolve.
  // A top-level import would make isConsoleOwner/isAuthorizedConsoleEmail
  // (used by anything checking admin access, including outside Next's
  // runtime) drag that whole chain in just to load this module.
  const tpl = await getEmailTemplate("console-admin-invite");
  const vars = { invited_by: escapeHtml(invitedBy), login_url: `${SITE_URL}/console/login` };
  const { sendEmail } = await import("@/lib/email");
  sendEmail({
    to: normalized,
    subject: applyTemplateVars(tpl.subject, vars),
    html: applyTemplateVars(tpl.body_html, vars),
    from: tpl.from_email,
    critical: tpl.critical,
    templateKey: tpl.key,
    category: "fixed",
    trackOpens: tpl.track_opens,
  }).catch((err) => console.error("Console admin invite email failed:", err));

  return { ok: true };
}

export async function removeConsoleAdmin(email: string): Promise<void> {
  await pool.query("DELETE FROM console_admins WHERE email = $1", [email.trim().toLowerCase()]);
}
