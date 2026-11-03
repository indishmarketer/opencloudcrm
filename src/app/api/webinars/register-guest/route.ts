import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import { pool, withTransaction } from "@/lib/db";
import { createEmailVerificationToken, safeRedirectPath } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { firstNameOf } from "@/lib/emailAutomation";
import { escapeHtml } from "@/lib/escapeHtml";
import { verifyTurnstile } from "@/lib/turnstile";
import { generateUniqueUsername } from "@/lib/community";
import { getAttributionFromRequest } from "@/lib/attribution";
import { consumeRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { ensureContact } from "@/lib/contacts";
import { normalizeCountry } from "@/lib/countries";
import { SITE_URL } from "@/config/brand";

const RegisterGuestSchema = z.object({
  webinarId: z.coerce.number().int().positive(),
  slug: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(320),
  turnstileToken: z.string().min(1).max(4096),
  redirect: z.string().max(1000).optional(),
  updates_opt_in: z.boolean().optional(),
}).strict();

/** Passwordless counterpart to /api/auth/signup, scoped to free webinar
 * registration -- no password field, no separate "log back in later" step.
 * Still creates a real account (this site's accounts are shared across
 * webinars/courses/community, by design), but the account is entered via a
 * single emailed link instead of a password. Reuses the existing
 * email-verification token mechanism unchanged: that flow already creates a
 * session and redirects on click, so an existing verified user clicking
 * this link simply gets signed in (COALESCE leaves their verified_at
 * untouched), while a brand-new user gets verified and signed in at once. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await consumeRateLimit(`webinar-guest-register:${ip}`, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = RegisterGuestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid registration details." }, { status: 400 });
  const { webinarId, slug, name, email, turnstileToken, redirect, updates_opt_in } = parsed.data;
  // Country is no longer asked for: it is detected from the visitor's IP.
  const country = normalizeCountry(req.headers.get("cf-ipcountry"));
  const countrySource = "ip" as const;

  if (!(await consumeRateLimit(`webinar-guest-register-email:${privateRateLimitKey(email)}`, 5, 24 * 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts for this email. Try again later." }, { status: 429 });
  }

  const humanVerified = await verifyTurnstile(turnstileToken, ip === "unknown" ? undefined : ip);
  if (!humanVerified) return NextResponse.json({ error: "Could not verify you're human. Try again." }, { status: 400 });

  const webinarResult = await pool.query("SELECT id, title FROM webinars WHERE id = $1 AND slug = $2 AND status = 'published' LIMIT 1", [webinarId, slug]);
  const webinar = webinarResult.rows[0];
  if (!webinar) return NextResponse.json({ error: "This webinar is not available." }, { status: 404 });

  const existing = await pool.query("SELECT id, email FROM users WHERE lower(email) = $1", [email]);
  let user: { id: number; email: string };

  if (existing.rows[0]) {
    user = existing.rows[0];
    // Only ever promote here, never demote -- an unchecked box on this
    // form isn't treated as an unsubscribe of an existing preference.
    if (updates_opt_in === true) {
      await pool.query("UPDATE users SET updates_opt_in = true WHERE id = $1 AND updates_opt_in = false", [user.id]);
    }
    await ensureContact({ email: user.email, userId: user.id, country, countrySource });
  } else {
    // Unusable random password -- satisfies the NOT NULL column without
    // anyone ever authenticating with it; they can set a real password
    // later via the normal reset flow if they ever want one.
    const passwordHash = await bcrypt.hash(crypto.randomUUID(), 12);
    user = await withTransaction(async (client) => {
      let created: { id: number; email: string } | undefined;
      for (let attempt = 0; attempt < 3 && !created; attempt++) {
        const username = await generateUniqueUsername(name || email);
        try {
          const result = await client.query(
            "INSERT INTO users (email, password_hash, name, username, interested_in, updates_opt_in) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email",
            [email, passwordHash, name || null, username, `Webinar: ${webinar.title}`, updates_opt_in === true]
          );
          created = result.rows[0];
        } catch (err) {
          const isUsernameConflict =
            err instanceof Error && "code" in err && (err as { code?: string }).code === "23505" &&
            "constraint" in err && String((err as { constraint?: string }).constraint || "").includes("username");
          if (!isUsernameConflict || attempt === 2) throw err;
        }
      }
      if (!created) throw new Error("Could not create account after retries.");
      await ensureContact({ email: created.email, userId: created.id, name, country, countrySource }, client);

      await client.query("UPDATE contact_submissions SET user_id = $1 WHERE email = $2 AND user_id IS NULL", [created.id, created.email]);
      await client.query("UPDATE newsletter_subscribers SET user_id = $1 WHERE email = $2 AND user_id IS NULL", [created.id, created.email]);

      const attr = getAttributionFromRequest(req);
      await client.query(
        `INSERT INTO attribution_events
           (user_id, email, event_type, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, landing_page)
         VALUES ($1, $2, 'signup', $3, $4, $5, $6, $7, $8, $9)`,
        [created.id, created.email, attr.utm_source, attr.utm_medium, attr.utm_campaign, attr.utm_term, attr.utm_content, attr.referrer, attr.landing_page]
      );
      return created;
    });
  }

  const token = await createEmailVerificationToken(user.id, user.email);
  const dest = safeRedirectPath(redirect);
  const verifyUrl = `${SITE_URL}/api/auth/verify-email?token=${token}&redirect=${encodeURIComponent(dest)}`;

  const tpl = await getEmailTemplate("webinar-guest-signin");
  const vars = { first_name: escapeHtml(firstNameOf(name)), webinar_title: escapeHtml(webinar.title), verify_url: verifyUrl };
  const emailResult = await sendEmail({
    to: user.email,
    subject: applyTemplateVars(tpl.subject, vars),
    html: applyTemplateVars(tpl.body_html, vars),
    from: tpl.from_email,
    templateKey: tpl.key,
    category: "fixed",
    trackOpens: tpl.track_opens,
  });

  if (!emailResult.ok) {
    return NextResponse.json({ error: "Could not send the sign-in link. Please try again in a moment." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
