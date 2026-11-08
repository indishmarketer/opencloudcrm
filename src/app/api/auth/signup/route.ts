import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { pool, withTransaction } from "@/lib/db";
import { createEmailVerificationToken, safeRedirectPath } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { firstNameOf } from "@/lib/emailAutomation";
import { escapeHtml } from "@/lib/escapeHtml";
import { verifyTurnstile } from "@/lib/turnstile";
import { generateUniqueUsername } from "@/lib/community";
import { getAttributionFromRequest } from "@/lib/attribution";
import { checkRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { ensureContact } from "@/lib/contacts";
import { normalizeCountry } from "@/lib/countries";
import { isPhoneRequired } from "@/lib/phoneRequirement";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { z } from "zod";

const SignupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(8).max(200),
  name: z.string().trim().min(1, "Enter your name.").max(200),
  interested_in: z.string().trim().max(500).optional(),
  turnstileToken: z.string().min(1).max(4096),
  redirect: z.string().max(1000).optional(),
  ref: z.string().trim().max(100).optional(),
  updates_opt_in: z.boolean().optional(),
  whatsapp_opt_in: z.boolean().optional(),
  country: z.string().trim().max(2).optional(),
  phone: z.string().trim().regex(/^\d{4,15}$/).optional(),
}).strict();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`signup:${ip}`, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = SignupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid signup details." }, { status: 400 });
  const { email, password, name, interested_in, turnstileToken, redirect, ref, updates_opt_in } = parsed.data;
  // Consent to WhatsApp without a number to send to is not consent to
  // anything, so the box only counts when a number came with it.
  const whatsappOptIn = parsed.data.whatsapp_opt_in === true && !!parsed.data.phone;
  // Country is a real required answer now, not a guess we fill in: it drives
  // the currency, the payment method, and whether the phone number below is
  // mandatory, so an IP fallback would silently decide all three.
  const country = normalizeCountry(parsed.data.country);
  if (!country) return NextResponse.json({ error: "Select your country." }, { status: 400 });
  if (isPhoneRequired(country) && !parsed.data.phone) {
    return NextResponse.json({ error: "Enter your phone number." }, { status: 400 });
  }
  if (!(await checkRateLimit(`signup-email:${privateRateLimitKey(email)}`, 3, 24 * 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many signup attempts." }, { status: 429 });
  }

  const humanVerified = await verifyTurnstile(turnstileToken, ip === "unknown" ? undefined : ip);
  if (!humanVerified) {
    return NextResponse.json({ error: "Could not verify you're human. Try again." }, { status: 400 });
  }

  const existing = await pool.query("SELECT id FROM users WHERE lower(email) = $1", [email]);
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // generateUniqueUsername checks availability, then this INSERT commits it
  // -- two signups racing on the same name can both pass the check for the
  // same candidate. Retry with a fresh candidate on a username collision
  // (Postgres 23505) instead of surfacing a 500 to one of them.
  const user = await withTransaction(async (client) => {
    let user: { id: number; email: string } | undefined;
    for (let attempt = 0; attempt < 3 && !user; attempt++) {
      const username = await generateUniqueUsername(name || email);
      await client.query("SAVEPOINT signup_username_attempt");
      try {
        const result = await client.query(
          // email_verified_at stays NULL until they click the link in the email
          // below -- no session is created in this request at all, so an account
          // created with a mistyped or someone-else's email address can't be used
          // (or get free course access) until the real owner of that inbox acts.
          "INSERT INTO users (email, password_hash, name, interested_in, username, updates_opt_in, whatsapp_opt_in) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, email",
          [email, passwordHash, name || null, interested_in || null, username, updates_opt_in === true, whatsappOptIn]
        );
        user = result.rows[0];
        await client.query("RELEASE SAVEPOINT signup_username_attempt");
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT signup_username_attempt");
        await client.query("RELEASE SAVEPOINT signup_username_attempt");
        const isUsernameConflict =
          err instanceof Error && "code" in err && (err as { code?: string }).code === "23505" &&
          "constraint" in err && String((err as { constraint?: string }).constraint || "").includes("username");
        if (!isUsernameConflict || attempt === 2) throw err;
      }
    }
    if (!user) throw new Error("Could not create account after retries.");

    // Link the contacts row to this account from the very first moment,
    // before any email (including the verification email below) fires and
    // creates one with user_id left NULL -- that gap was why real,
    // already-verified accounts couldn't be reliably matched back to their
    // users row later (e.g. for deliverability recovery, review requests).
    await ensureContact({
      email: user.email,
      userId: user.id,
      name: name || null,
      country,
      countrySource: "form",
      phone: parsed.data.phone || null,
      phoneSource: parsed.data.phone ? "form" : undefined,
    }, client);

    // Track referral if ref was supplied
    if (ref && typeof ref === "string") {
      await client.query("SAVEPOINT signup_referral_attempt");
      try {
        const referrerRes = await client.query("SELECT id FROM users WHERE LOWER(username) = LOWER($1)", [ref.trim()]);
        if (referrerRes.rows.length > 0) {
          const referrerId = referrerRes.rows[0].id;
          if (referrerId !== user.id) {
            await client.query("UPDATE users SET referred_by = $1 WHERE id = $2", [referrerId, user.id]);
            await client.query(
              "INSERT INTO community_invites (inviter_id, invitee_id, code) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
              [referrerId, user.id, ref.trim()]
            );
            await client.query("UPDATE users SET community_points = community_points + 10 WHERE id = $1", [referrerId]);
          }
        }
        await client.query("RELEASE SAVEPOINT signup_referral_attempt");
      } catch (e) {
        await client.query("ROLLBACK TO SAVEPOINT signup_referral_attempt");
        await client.query("RELEASE SAVEPOINT signup_referral_attempt");
        console.error("Referral tracking error (ignoring if table/col does not exist yet):", e);
      }
    }

    // Retroactive sync: anything submitted anonymously before this account
    // existed becomes part of the same contact from this point on.
    await client.query(
      "UPDATE contact_submissions SET user_id = $1 WHERE email = $2 AND user_id IS NULL",
      [user.id, user.email]
    );
    await client.query(
      "UPDATE newsletter_subscribers SET user_id = $1 WHERE email = $2 AND user_id IS NULL",
      [user.id, user.email]
    );

    const attr = getAttributionFromRequest(req);
    await client.query(
      `INSERT INTO attribution_events
         (user_id, email, event_type, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, landing_page)
       VALUES ($1, $2, 'signup', $3, $4, $5, $6, $7, $8, $9)`,
      [user.id, user.email, attr.utm_source, attr.utm_medium, attr.utm_campaign, attr.utm_term, attr.utm_content, attr.referrer, attr.landing_page]
    );
    return user;
  });

  const token = await createEmailVerificationToken(user.id, user.email);
  const dest = safeRedirectPath(redirect);
  const verifyUrl = `${SITE_URL}/api/auth/verify-email?token=${token}&redirect=${encodeURIComponent(dest)}`;

  const tpl = await getEmailTemplate("email-verification");
  const vars = { first_name: escapeHtml(firstNameOf(name)), verify_url: verifyUrl };
  const emailResult = await sendEmail({
    to: user.email,
    subject: applyTemplateVars(tpl.subject, vars),
    html: applyTemplateVars(tpl.body_html, vars),
    from: tpl.from_email,
    critical: tpl.critical,
    templateKey: tpl.key,
    category: "fixed",
    trackOpens: tpl.track_opens,
  });

  // Account exists either way (so a duplicate signup attempt correctly
  // 409s), but if the verification email itself failed to send, tell the
  // user now instead of leaving them stuck waiting for an email that never
  // arrived -- they can retry via /api/auth/resend-verification later.
  if (!emailResult.ok) {
    return NextResponse.json(
      { ok: false, error: "Account created, but the confirmation email couldn't be sent. Try resending it from the login page in a moment." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, needsVerification: true });
}
