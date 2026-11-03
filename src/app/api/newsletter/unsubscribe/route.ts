import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/newsletterUnsubscribe";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { SITE_URL } from "@/config/brand";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const token = form.get("token");

  const subscriberId = typeof token === "string" ? await verifyUnsubscribeToken(token) : null;
  if (!subscriberId) {
    return NextResponse.redirect(new URL("/unsubscribe?error=1", SITE_URL), 303);
  }

  const result = await pool.query(
    "UPDATE newsletter_subscribers SET unsubscribed_at = now() WHERE id = $1 AND unsubscribed_at IS NULL RETURNING email, name",
    [subscriberId]
  );
  if (result.rows[0]) {
    emitWebhookEvent({
      eventType: "newsletter.unsubscribed",
      source: "newsletter_subscribers",
      sourceRecordId: subscriberId,
      contactEmail: result.rows[0].email,
      contactName: result.rows[0].name,
      data: { email: result.rows[0].email },
    }).catch(() => {});
  }

  return NextResponse.redirect(new URL("/unsubscribe?done=1", SITE_URL), 303);
}
