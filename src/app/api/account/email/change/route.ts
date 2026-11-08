import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { consumeRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { startEmailChange } from "@/lib/accountContact";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/escapeHtml";
import { applyTemplateVars, getEmailTemplate } from "@/lib/emailTemplates";
import { SITE_URL } from "@/lib/liveSiteUrl";

const Schema = z.object({ email: z.string().trim().toLowerCase().email().max(320) }).strict();

/**
 * Asks to change the account's email address. Nothing changes here: a link
 * goes to the **new** address and the change happens when it is opened.
 *
 * The response is the same whether or not the address is already taken by
 * another account. Saying "that address is already registered" to anyone
 * who is signed in turns this endpoint into a way to test which addresses
 * have accounts. The person with the real problem still finds out, because
 * the confirmation link refuses the change with a clear reason.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Log in first." }, { status: 401 });

  if (!(await consumeRateLimit(`account-email-change:${session.userId}`, 5, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const newEmail = parsed.data.email;

  if (newEmail === session.email.toLowerCase()) {
    return NextResponse.json({ error: "That is already your email address." }, { status: 400 });
  }

  // Also limited per target address, so this cannot be used to send
  // repeated mail to somebody else's inbox.
  if (!(await consumeRateLimit(`account-email-target:${privateRateLimitKey(newEmail)}`, 5, 60 * 60 * 1000))) {
    return NextResponse.json({ ok: true });
  }

  const taken = await pool.query("SELECT 1 FROM users WHERE lower(email) = lower($1) AND id <> $2", [
    newEmail,
    session.userId,
  ]);
  if (taken.rows.length > 0) {
    // Deliberately indistinguishable from success. See the note above.
    return NextResponse.json({ ok: true });
  }

  const token = await startEmailChange(session.userId, newEmail);
  const link = `${SITE_URL}/account/email-changed?token=${encodeURIComponent(token)}`;
  const template = await getEmailTemplate("account-email-change");
  const vars = {
    confirm_url: escapeHtml(link),
    current_email: escapeHtml(session.email),
  };

  await sendEmail({
    to: newEmail,
    subject: applyTemplateVars(template.subject, vars),
    html: applyTemplateVars(template.body_html, vars),
    from: template.from_email,
    critical: template.critical,
    category: "fixed",
    templateKey: template.key,
    trackOpens: template.track_opens,
    trackClicks: false,
  });

  return NextResponse.json({ ok: true });
}
