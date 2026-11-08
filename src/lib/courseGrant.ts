import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { pool, withTransaction } from "@/lib/db";
import { createEmailVerificationToken } from "@/lib/auth";
import { sendEmailWithRetry } from "@/lib/emailOutbox";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { firstNameOf } from "@/lib/emailAutomation";
import { escapeHtml } from "@/lib/escapeHtml";
import { generateUniqueUsername } from "@/lib/community";
import { normalizeContactEmail } from "@/lib/contacts";
import { SITE_URL } from "@/lib/liveSiteUrl";

type Account = { id: number; email: string; name: string | null; verified: boolean; created: boolean };

/** Finds the account for this email, or creates one so an admin can grant a
 * course to a contact who never signed up. The password is random and never
 * shown to anyone: they get in through the emailed sign-in link, and can set
 * a password later with "Forgot password". The users trigger links the
 * existing contact row to the new account. */
export async function findOrCreateAccount(emailInput: string, name: string | null): Promise<Account> {
  const email = normalizeContactEmail(emailInput);
  const existing = await pool.query(
    "SELECT id, email, name, email_verified_at FROM users WHERE lower(email) = $1",
    [email],
  );
  if (existing.rows[0]) {
    const u = existing.rows[0];
    return { id: u.id, email: u.email, name: u.name, verified: Boolean(u.email_verified_at), created: false };
  }

  const passwordHash = await bcrypt.hash(randomUUID(), 12);
  return withTransaction(async (client) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const username = await generateUniqueUsername(name || email);
      try {
        const result = await client.query(
          `INSERT INTO users (email, password_hash, name, username, interested_in, updates_opt_in)
           VALUES ($1, $2, $3, $4, 'Added by admin', false) RETURNING id, email, name`,
          [email, passwordHash, name || null, username],
        );
        const u = result.rows[0];
        await client.query("UPDATE contact_submissions SET user_id = $1 WHERE lower(email) = $2 AND user_id IS NULL", [u.id, email]);
        await client.query("UPDATE newsletter_subscribers SET user_id = $1 WHERE lower(email) = $2 AND user_id IS NULL", [u.id, email]);
        return { id: u.id, email: u.email, name: u.name, verified: false, created: true };
      } catch (err) {
        const e = err as { code?: string; constraint?: string };
        if (e.code !== "23505" || !String(e.constraint || "").includes("username") || attempt === 2) throw err;
      }
    }
    throw new Error("Could not create account.");
  });
}

/** Gives the account the course and emails them. Someone who can't log in
 * yet (new or never verified) gets a sign-in link that opens the course;
 * everyone else gets the normal "you're in" email. Sent as critical so an
 * earlier marketing unsubscribe can't swallow it: it's about access they
 * were just given, not marketing. */
export async function grantCourseManually(account: Account, course: { id: number; slug: string; title: string }, tier: "free" | "pro") {
  await pool.query(
    `INSERT INTO course_enrollments (user_id, course_id, tier, granted_via)
     VALUES ($1, $2, $3, 'manual')
     ON CONFLICT (user_id, course_id) DO UPDATE SET tier = $3, granted_via = 'manual'`,
    [account.id, course.id, tier],
  );

  const coursePath = `/account/courses/${encodeURIComponent(course.slug)}`;
  const needsSignIn = account.created || !account.verified;
  const vars: Record<string, string> = {
    first_name: escapeHtml(firstNameOf(account.name)),
    tier_label: tier === "pro" ? "full PRO" : "free",
    course_title: escapeHtml(course.title),
    course_url: `${SITE_URL}${coursePath}`,
  };
  if (needsSignIn) {
    const token = await createEmailVerificationToken(account.id, account.email);
    vars.signin_url = `${SITE_URL}/api/auth/verify-email?token=${token}&redirect=${encodeURIComponent(coursePath)}`;
  }

  const tpl = await getEmailTemplate(needsSignIn ? "course-access-granted-new-account" : "course-access-granted-manual");
  const sent = await sendEmailWithRetry({
    to: account.email,
    subject: applyTemplateVars(tpl.subject, vars),
    html: applyTemplateVars(tpl.body_html, vars),
    from: tpl.from_email,
    critical: true,
    templateKey: tpl.key,
    category: "fixed",
    trackOpens: tpl.track_opens,
  });
  return { emailed: sent.ok || Boolean(sent.queued) };
}
