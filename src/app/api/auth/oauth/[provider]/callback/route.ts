import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { originPageSource } from "@/lib/pageSources";
import { ACCOUNT_SOURCE_LABEL } from "@/lib/pageSourcesShape";
import bcrypt from "bcryptjs";
import { jwtVerify } from "jose";
import { pool, withTransaction } from "@/lib/db";
import { createSession, consumeJti, getSessionSecret, safeRedirectPath } from "@/lib/auth";
import { isSsoProvider, exchangeCodeForToken, fetchSsoProfile, ssoCallbackUrl } from "@/lib/sso";
import { checkRateLimit } from "@/lib/rateLimit";
import { ensureContact, normalizeContactEmail } from "@/lib/contacts";
import { generateUniqueUsername } from "@/lib/community";
import { getAttributionFromRequest } from "@/lib/attribution";
import { normalizeCountry } from "@/lib/countries";
import { requestOrigin } from "@/lib/requestOrigin";
import { emitVerifiedContactEvent } from "@/lib/verifiedContactEvent";

const secret = () => new TextEncoder().encode(getSessionSecret());

function failureRedirect(code: string, origin: string) {
  return NextResponse.redirect(new URL(`/login?error=${code}`, origin));
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isSsoProvider(provider)) return NextResponse.json({ error: "Unknown provider." }, { status: 404 });
  const origin = requestOrigin(req);

  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`oauth-callback:${ip}`, 20, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateToken = searchParams.get("state");
  if (!code || !stateToken) return failureRedirect("oauth_failed", origin);

  let redirectPath = "/account";
  let ref: string | null = null;
  try {
    const { payload } = await jwtVerify(stateToken, secret());
    if (payload.purpose !== "sso-state" || payload.provider !== provider || payload.origin !== origin) return failureRedirect("oauth_failed", origin);
    if (typeof payload.jti !== "string" || !(await consumeJti(payload.jti))) return failureRedirect("oauth_failed", origin);
    redirectPath = safeRedirectPath(typeof payload.redirect === "string" ? payload.redirect : null);
    ref = typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return failureRedirect("oauth_failed", origin);
  }

  const redirectUri = ssoCallbackUrl(provider, origin);
  const tokens = await exchangeCodeForToken(provider, code, redirectUri);
  if (!tokens) return failureRedirect("oauth_failed", origin);

  const profile = await fetchSsoProfile(provider, tokens);
  if (!profile || !profile.emailVerified) return failureRedirect("oauth_unverified", origin);

  const email = normalizeContactEmail(profile.email);
  const name = profile.name?.trim() || null;
  if (!email || !name) return failureRedirect("oauth_profile_incomplete", origin);

  const linked = await pool.query<{ user_id: number }>(
    "SELECT user_id FROM oauth_identities WHERE provider = $1 AND provider_user_id = $2",
    [provider, profile.providerUserId],
  );

  let userId: number;
  let isNewUser = false;
  let becameVerified = false;

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
        becameVerified = true;
      }
      await pool.query(
        "INSERT INTO oauth_identities (user_id, provider, provider_user_id, email) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
        [userId, provider, profile.providerUserId, email],
      );
    } else {
      isNewUser = true;
      becameVerified = true;
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
  try {
    await ensureContact({ source: "account", sourceDetail: ACCOUNT_SOURCE_LABEL, extraSources: [await originPageSource(req)],
      email,
      userId,
      name,
      country: ipCountry,
      countrySource: ipCountry ? "ip" : undefined,
    });
  } catch (error) {
    console.error("oauth ensureContact failed:", error);
    return failureRedirect("oauth_failed", origin);
  }
  if (becameVerified) {
    await emitVerifiedContactEvent({ email, name, userId, source: provider }).catch((error) => console.error("OAuth verified contact event failed:", error));
  }

  await createSession({ userId, email });

  return NextResponse.redirect(new URL(redirectPath, origin));
}
