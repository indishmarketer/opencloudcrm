import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyEmailClickToken } from "@/lib/emailOpenTracking";
import { BURST_WINDOW_SECONDS, classifyEmailClick } from "@/lib/emailClickFilter";
import { SITE_URL as FALLBACK } from "@/lib/liveSiteUrl";

async function handle(req: NextRequest) {
  const tracking = await verifyEmailClickToken(req.nextUrl.searchParams.get("t") || "");
  if (!tracking) return NextResponse.redirect(FALLBACK);

  try {
    const meta = await pool.query(
      `SELECT d.sent_at,
              EXISTS (
                SELECT 1 FROM email_events e
                WHERE e.delivery_id = d.id AND e.event IN ('clicked', 'bot_clicked')
                  AND e.created_at > now() - make_interval(secs => $2)
                  AND e.meta->>'target' IS DISTINCT FROM $3
              ) AS burst
       FROM email_deliveries d WHERE d.id = $1`,
      [tracking.deliveryId, BURST_WINDOW_SECONDS, tracking.target],
    );
    const info = meta.rows[0];
    const verdict = classifyEmailClick({
      method: req.method,
      userAgent: req.headers.get("user-agent"),
      sentAt: info?.sent_at ? new Date(info.sent_at) : null,
      now: new Date(),
      otherLinkClickedWithinBurst: info?.burst === true,
    });

    if (info && !verdict.human) {
      // Logged for visibility only: no click counts, no engagement, no
      // click-triggered automation.
      await pool.query(
        `INSERT INTO email_events (delivery_id, template_key, category, recipient_email, message_id, event, meta)
         SELECT id, template_key, category, recipient_email, provider_message_id, 'bot_clicked', $2
         FROM email_deliveries WHERE id = $1`,
        [tracking.deliveryId, JSON.stringify({ source: "redirect", target: tracking.target, reason: verdict.reason })],
      );
    } else if (info) {
      const delivery = await pool.query(
        `UPDATE email_deliveries
         SET first_clicked_at = COALESCE(first_clicked_at, now()), last_clicked_at = now(), click_count = click_count + 1,
             first_opened_at = COALESCE(first_opened_at, now())
         WHERE id = $1
         RETURNING contact_id, template_key, category, recipient_email, provider_message_id`,
        [tracking.deliveryId],
      );
      const row = delivery.rows[0];
      if (row) {
        await pool.query("UPDATE review_requests SET clicked_at=COALESCE(clicked_at,now()),updated_at=now() WHERE email_delivery_id=$1", [tracking.deliveryId]);
        await pool.query(
          `INSERT INTO email_events
             (delivery_id, template_key, category, recipient_email, message_id, event, meta, provider_event_key)
           VALUES ($1, $2, $3, $4, $5, 'clicked', $6, $7)
           ON CONFLICT (provider_event_key) WHERE provider_event_key IS NOT NULL DO NOTHING`,
          [tracking.deliveryId, row.template_key, row.category, row.recipient_email, row.provider_message_id,
           JSON.stringify({ source: "redirect", target: tracking.target }),
           `redirect:clicked:${tracking.deliveryId}:${new Date().toISOString().slice(0, 10)}:${tracking.target}`],
        );
        if (row.contact_id) {
          await pool.query("UPDATE contacts SET last_engaged_at = now(), updated_at = now() WHERE id = $1", [row.contact_id]);
        }
      }
    }
  } catch (error) {
    console.error("email click tracking failed (non-fatal):", error);
  }

  // Everyone, scanner or person, still gets the real destination.
  return NextResponse.redirect(tracking.target);
}

export const GET = handle;
export const HEAD = handle;
