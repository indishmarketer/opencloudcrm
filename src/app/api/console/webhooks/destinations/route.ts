import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { generateSigningSecret, maskSecret } from "@/lib/webhookSigning";
import { validateOutboundWebhookUrl } from "@/lib/webhookUrlValidation";
import { isValidWebhookEventType } from "@/lib/webhookEventCatalogue";

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await pool.query(
    `SELECT
       d.id, d.name, d.url, d.enabled, d.event_types, d.description, d.created_at, d.updated_at,
       d.signing_secret,
       -- Every stat below excludes is_test rows (manual "send test" pings) so
       -- success rate and pending/dead counts reflect real traffic only.
       (SELECT max(wd.delivered_at) FROM webhook_deliveries wd JOIN webhook_outbox_events e ON e.id = wd.event_id
          WHERE wd.destination_id = d.id AND wd.status = 'delivered' AND e.is_test = false) AS last_success_at,
       (SELECT max(wd.last_attempted_at) FROM webhook_deliveries wd JOIN webhook_outbox_events e ON e.id = wd.event_id
          WHERE wd.destination_id = d.id AND wd.status IN ('failed', 'dead') AND e.is_test = false) AS last_failure_at,
       (SELECT count(*)::int FROM webhook_deliveries wd JOIN webhook_outbox_events e ON e.id = wd.event_id
          WHERE wd.destination_id = d.id AND wd.status = 'delivered' AND e.is_test = false) AS delivered_count,
       (SELECT count(*)::int FROM webhook_deliveries wd JOIN webhook_outbox_events e ON e.id = wd.event_id
          WHERE wd.destination_id = d.id AND wd.status = 'dead' AND e.is_test = false) AS dead_count,
       (SELECT count(*)::int FROM webhook_deliveries wd JOIN webhook_outbox_events e ON e.id = wd.event_id
          WHERE wd.destination_id = d.id AND wd.status IN ('pending', 'processing', 'failed') AND e.is_test = false) AS pending_count
     FROM webhook_destinations d
     ORDER BY d.created_at DESC`
  );

  const destinations = result.rows.map((row) => {
    const total = row.delivered_count + row.dead_count;
    return {
      id: row.id,
      name: row.name,
      url: row.url,
      enabled: row.enabled,
      event_types: row.event_types,
      description: row.description,
      created_at: row.created_at,
      updated_at: row.updated_at,
      masked_secret: maskSecret(row.signing_secret),
      last_success_at: row.last_success_at,
      last_failure_at: row.last_failure_at,
      pending_count: row.pending_count,
      dead_count: row.dead_count,
      success_rate: total > 0 ? Math.round((row.delivered_count / total) * 1000) / 10 : null,
    };
  });

  return NextResponse.json({ destinations });
}

export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim() || typeof body.url !== "string") {
    return NextResponse.json({ error: "Name and URL are required." }, { status: 400 });
  }

  const validation = await validateOutboundWebhookUrl(body.url);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.reason }, { status: 400 });
  }

  const eventTypes: string[] = Array.isArray(body.event_types)
    ? body.event_types.filter((e: unknown) => typeof e === "string" && isValidWebhookEventType(e))
    : [];

  const secret = generateSigningSecret();
  const result = await pool.query(
    `INSERT INTO webhook_destinations (name, url, enabled, event_types, signing_secret, description)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      String(body.name).slice(0, 200),
      body.url.slice(0, 2000),
      body.enabled !== false,
      eventTypes,
      secret,
      body.description ? String(body.description).slice(0, 500) : null,
    ]
  );

  // The signing secret is only ever shown in full at the moment of
  // creation/rotation -- every subsequent GET returns it masked.
  return NextResponse.json({ ok: true, id: result.rows[0].id, signing_secret: secret });
}
