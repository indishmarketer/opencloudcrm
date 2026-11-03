import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyEmailOpenToken, TRACKING_PIXEL_GIF } from "@/lib/emailOpenTracking";

export async function GET(req: NextRequest) {
  const payload = await verifyEmailOpenToken(req.nextUrl.searchParams.get("t") || "");
  if (payload) {
    try {
      let contactId: number | null = null;
      if (payload.deliveryId) {
        const delivery = await pool.query(
          `UPDATE email_deliveries
           SET first_opened_at = COALESCE(first_opened_at, now()), last_opened_at = now(), open_count = open_count + 1
           WHERE id = $1 RETURNING contact_id`,
          [payload.deliveryId],
        );
        contactId = delivery.rows[0]?.contact_id || null;
      }
      await pool.query(
        `INSERT INTO email_events
           (delivery_id, template_key, category, recipient_email, event, meta, provider_event_key)
         VALUES ($1, $2, $3, $4, 'opened', '{"source":"pixel"}'::jsonb, $5)
         ON CONFLICT (provider_event_key) WHERE provider_event_key IS NOT NULL DO NOTHING`,
        [payload.deliveryId, payload.templateKey, payload.category, payload.email,
         // One row per delivery per day, so repeat opens on later days count
         // toward "opened in the last 7 days" filters and the daily charts.
         payload.deliveryId ? `pixel:opened:${payload.deliveryId}:${new Date().toISOString().slice(0, 10)}` : null],
      );
      if (contactId) {
        await pool.query(
          "UPDATE contacts SET last_engaged_at = now(), updated_at = now() WHERE id = $1",
          [contactId],
        );
      }
    } catch (e) {
      console.error("email open pixel: event insert failed (non-fatal):", e);
    }
  }
  return new NextResponse(new Uint8Array(TRACKING_PIXEL_GIF), {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store",
    },
  });
}
