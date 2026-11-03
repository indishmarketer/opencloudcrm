import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { jwtVerify } from "jose";
import { pool, withTransaction } from "@/lib/db";
import { createSession, consumeJti, getSessionSecret, safeRedirectPath } from "@/lib/auth";
import { isSsoProvider, exchangeCodeForToken, fetchSsoProfile } from "@/lib/sso";
import { checkRateLimit } from "@/lib/rateLimit";
import { ensureContact, normalizeContactEmail } from "@/lib/contacts";
import { generateUniqueUsername } from "@/lib/community";
import { getAttributionFromRequest } from "@/lib/attribution";
import { normalizeCountry } from "@/lib/countries";
import { SITE_URL } from "@/config/brand";

const secret = () => new TextEncoder().encode(getSessionSecret());

function failureRedirect(code: string) {
  return NextResponse.redirect(`${SITE_URL}/login?error=${code}`);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isSsoProvider(provider)) return NextResponse.json({ error: "Unknown provider." }, { status: 404 });

  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`oauth-callback:${ip}`, 20, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateToken = searchParams.get("state");
  if (!code || !stateToken) return failureRedirect("oauth_failed");

  let redirectPath = "/account";
  let ref: string | null = null;
  try {
    const { payload } = await jwtVerify(stateToken, secret());
    if (payload.purpose !== "sso-state" || payload.provider !== provider) return failureRedirect("oauth_failed");
    if (typeof payload.jti !== "string" || !(await consumeJti(payload.jti))) return failureRedirect("oauth_failed");
    redirectPath = safeRedirectPath(typeof payload.redirect === "string" ? payload.redirect : null);
    ref = typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return failureRedirect("oauth_failed");
  }

  const redirectUri = `${SITE_URL}/api/auth/oauth/${provider}/callback`;
  const tokens = await exchangeCodeForToken(provider, code, redirectUri);
  if (!tokens) return failureRedirect("oauth_failed");

  const profile = await fetchSsoProfile(provider, tokens);
  if (!profile || !profile.emailVerified) return failureRedirect("oauth_unverified");

  const email = normalizeContactEmail(profile.email);
  const name = profile.name?.trim() || null;

  const linked = await pool.query<{ user_id: number }>(
    "SELECT user_id FROM oauth_identities WHERE provider = $1 AND provider_user_id = $2",
    [provider, profile.providerUserId],
  );

  let userId: number;
  let isNewUser = false;

  if (linked.rows[0]) {
    userId = linked.rows[0].user_id;
  } else {
    const existingUser = await pool.query<{ id: number; email_verified_at: Date | null }>(
      "SELECT id, email_verified_at FROM users WHERE lower(email) = $1",
      [email],
    );
    if (existingUser.rows[0]) {
      userId = existingUser.rows[0].id;
      // The provider just proved this inbox is theirs -- same reasoning as
      // confirmContactDeliverable: fresh direct proof overrides an older
      // unverified state.
      if (!existingUser.rows[0].email_verified_at) {
        await pool.query("UPDATE users SET email_verified_at = now() WHERE id = $1", [userId]);
      }
      await pool.query(
        "INSERT INTO oauth_identities (user_id, provider, provider_user_id, email) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
        [userId, provider, profile.providerUserId, email],
      );
    } else {
      isNewUser = true;
      const passwordHash = await bcrypt.hash(crypto.randomUUID(), 12);
      userId = await withTransaction(async (client) => {
        let created: { id: number } | undefined;
        for (let attempt = 0; attempt < 3 && !created; attempt++) {
          const username = await generateUniqueUsername(name || email);
          try {
            const result = await client.query(
              // email_verified_at is set immediately -- the provider already
              // proved ownership, so there's no separate confirmation email.
              `INSERT INTO users (email, password_hash, name, username, updates_opt_in, whatsapp_opt_in, email_verified_at)
               VALUES ($1, $2, $3, $4, true, false, now()) RETURNING id`,
              [email, passwordHash, name, username],
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

        await client.query(
          "INSERT INTO oauth_identities (user_id, provider, provider_user_id, email) VALUES ($1, $2, $3, $4)",
          [created.id, provider, profile.providerUserId, email],
        );

        if (ref) {
          const referrerRes = await client.query("SELECT id FROM users WHERE LOWER(username) = LOWER($1)", [ref.trim()]);
          if (referrerRes.rows.length > 0) {
            const referrerId = referrerRes.rows[0].id;
            if (referrerId !== created.id) {
              await client.query("UPDATE users SET referred_by = $1 WHERE id = $2", [referrerId, created.id]);
              await client.query(
                "INSERT INTO community_invites (inviter_id, invitee_id, code) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
                [referrerId, created.id, ref.trim()],
              );
              await client.query("UPDATE users SET community_points = community_points + 10 WHERE id = $1", [referrerId]);
            }
          }
        }

        await client.query("UPDATE contact_submissions SET user_id = $1 WHERE email = $2 AND user_id IS NULL", [created.id, email]);
        await client.query("UPDATE newsletter_subscribers SET user_id = $1 WHERE email = $2 AND user_id IS NULL", [created.id, email]);

        return created.id;
      });
    }
  }

  if (isNewUser) {
    const attr = getAttributionFromRequest(req);
    await pool.query(
      `INSERT INTO attribution_events
         (user_id, email, event_type, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, landing_page)
       VALUES ($1, $2, 'signup', $3, $4, $5, $6, $7, $8, $9)`,
      [userId, email, attr.utm_source, attr.utm_medium, attr.utm_campaign, attr.utm_term, attr.utm_content, attr.referrer, attr.landing_page],
    );
  }

  const ipCountry = normalizeCountry(req.headers.get("cf-ipcountry"));
  await ensureContact({
    email,
    userId,
    name,
    country: ipCountry,
    countrySource: ipCountry ? "ip" : undefined,
  }).catch((err) => console.error("oauth ensureContact failed (non-fatal):", err));

  await createSession({ userId, email });

  return NextResponse.redirect(new URL(redirectPath, SITE_URL).toString());
}
