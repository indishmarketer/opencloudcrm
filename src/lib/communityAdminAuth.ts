import { getAdminSessionEmail, getSession } from "@/lib/auth";
import { isModeratorOrAdmin } from "@/lib/community";
import { isConsoleOwner } from "@/lib/consoleAdmins";
import { pool } from "@/lib/db";

/** Who is performing a community admin action, however they signed in.
 * `userId` is null when a console admin has no site account of their own:
 * `community_bans.banned_by` is nullable precisely so an action can be
 * recorded without inventing a member row for them. */
export type CommunityActor = {
  userId: number | null;
  email: string;
  /** True when this came from the console session rather than the site one. */
  viaConsole: boolean;
};

/** The console is a second, stronger door into the same moderation tools:
 * it is behind the emailed link plus an authenticator, and the authorized
 * list is re-read on every request. Community admin used to live only on
 * the public site, so every one of these endpoints checked the site
 * session alone; the console pages would otherwise have to ask the owner
 * to be logged in twice, in two different places, to use them. */
async function consoleActor(): Promise<{ email: string; userId: number | null } | null> {
  const email = await getAdminSessionEmail();
  if (!email) return null;
  const result = await pool.query<{ id: number }>("SELECT id FROM users WHERE lower(email) = lower($1)", [email]);
  return { email, userId: result.rows[0]?.id ?? null };
}

/** Moderator level: the approval queue, bans, renaming a member. Granted to
 * community moderators, the owner, and any console admin. */
export async function getCommunityModerator(): Promise<CommunityActor | null> {
  const session = await getSession();
  if (session && (await isModeratorOrAdmin(session.userId))) {
    return { userId: session.userId, email: session.email, viaConsole: false };
  }
  const console_ = await consoleActor();
  return console_ ? { ...console_, viaConsole: true } : null;
}

/** Owner level: who the moderators are, space settings, categories. An
 * invited console admin does not get this, matching the ADMIN_EMAIL-only
 * rule these endpoints have always had. */
export async function getCommunityOwner(): Promise<CommunityActor | null> {
  const session = await getSession();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (session && adminEmail && session.email === adminEmail) {
    return { userId: session.userId, email: session.email, viaConsole: false };
  }
  const console_ = await consoleActor();
  if (console_ && isConsoleOwner(console_.email)) return { ...console_, viaConsole: true };
  return null;
}
