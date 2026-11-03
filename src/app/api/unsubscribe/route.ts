import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/emailUnsubscribe";
import { verifyUnsubscribeToken as verifyLegacyNewsletterToken } from "@/lib/newsletterUnsubscribe";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { SITE_URL } from "@/lib/siteMeta";

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  const isOneClick = contentType.includes("application/x-www-form-urlencoded") &&
    (await req.clone().text()).includes("List-Unsubscribe=One-Click");
  const formData = isOneClick ? null : await req.formData();
  const token = req.nextUrl.searchParams.get("token") || formData?.get("token");

  // Never trust a client-supplied plain email -- always derive it from a
  // signed token, verified server-side, same as the page that renders this
  // form. Two token shapes are accepted (current email-keyed, and the
  // older subscriber-id-keyed one from before this system existed), but
  // both are cryptographically verified here, not passed through as data.
  let email: string | null = typeof token === "string" && token ? await verifyUnsubscribeToken(token) : null;
  if (!email && typeof token === "string" && token) {
    const subscriberId = await verifyLegacyNewsletterToken(token);
    if (subscriberId) {
      const result = await pool.query("SELECT email FROM newsletter_subscribers WHERE id = $1", [
        subscriberId,
      ]);
      email = result.rows[0]?.email || null;
    }
  }

  if (!email) {
    return NextResponse.redirect(new URL("/unsubscribe?error=1", SITE_URL));
  }
  const normalizedEmail = email.trim().toLowerCase();

  await pool.query(
    "INSERT INTO email_suppressions (email) VALUES ($1) ON CONFLICT (email) DO NOTHING",
    [normalizedEmail]
  );
  // Keep the newsletter-specific list in sync so its own recipient query
  // (WHERE unsubscribed_at IS NULL) reflects a global unsubscribe too.
  const subResult = await pool.query(
    "UPDATE newsletter_subscribers SET unsubscribed_at = now() WHERE lower(trim(email)) = $1 AND unsubscribed_at IS NULL RETURNING id, name",
    [normalizedEmail]
  );
  await pool.query(
    `UPDATE contacts SET marketing_status = 'unsubscribed', deliverability_status = 'suppressed', updated_at = now()
     WHERE normalized_email = lower(trim($1))`,
    [normalizedEmail],
  );
  // For analytics: credit the unsubscribe to the latest email this person got
  // (the token is per address, not per email). Once per address per day.
  await pool.query(
    `INSERT INTO email_events
       (delivery_id, template_key, category, recipient_email, message_id, event, meta, provider_event_key)
     SELECT d.id, d.template_key, COALESCE(d.category, 'unknown'), $1, d.provider_message_id, 'unsubscribed',
            $2::jsonb, $3
     FROM (SELECT 1) one
     LEFT JOIN LATERAL (
       SELECT id, template_key, category, provider_message_id FROM email_deliveries
       WHERE lower(recipient_email) = $1 AND NOT is_test AND sent_at > now() - interval '30 days'
       ORDER BY sent_at DESC LIMIT 1
     ) d ON TRUE
     ON CONFLICT (provider_event_key) WHERE provider_event_key IS NOT NULL DO NOTHING`,
    [normalizedEmail, JSON.stringify({ source: isOneClick ? "one-click" : "page" }),
     `unsubscribe:${normalizedEmail}:${new Date().toISOString().slice(0, 10)}`],
  ).catch((error) => console.error("unsubscribe event insert failed (non-fatal):", error));
  // Keyed by the same (source, subscriber id) pair the legacy unsubscribe
  // route uses, so both entry points onto the same subscriber row can never
  // double-fire this event for the same real unsubscribe.
  if (subResult.rows[0]) {
    emitWebhookEvent({
      eventType: "newsletter.unsubscribed",
      source: "newsletter_subscribers",
      sourceRecordId: subResult.rows[0].id,
      contactEmail: normalizedEmail,
      contactName: subResult.rows[0].name,
      data: { email: normalizedEmail },
    }).catch(() => {});
  }

  if (isOneClick) return NextResponse.json({ ok: true });
  return NextResponse.redirect(new URL("/unsubscribe?done=1", SITE_URL));
}
