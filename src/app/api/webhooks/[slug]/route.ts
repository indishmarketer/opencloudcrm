import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { pool } from "@/lib/db";
import { confirmContactSubscribed, recordContactActivity } from "@/lib/contacts";
import { sendOpenCloudCrmWelcomeEmailOnce } from "@/lib/openCloudCrmLeads";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { hasActiveInboundWebhookAction } from "@/lib/workflows";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const secret = process.env.WEBHOOK_SHARED_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });

  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > 256 * 1024) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const timestamp = req.headers.get("x-webhook-timestamp") || "";
  const signature = req.headers.get("x-webhook-signature") || "";
  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    return NextResponse.json({ error: "Expired request." }, { status: 401 });
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody) > 256 * 1024) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const isMatch = signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!isMatch) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { slug } = await params;
  const safeSlug = slug.slice(0, 100);
  const eventResult = await pool.query<{ id: string }>(
    "INSERT INTO webhook_events (slug, payload) VALUES ($1, $2::jsonb) RETURNING id",
    [safeSlug, JSON.stringify(payload)],
  );

  // A lead-shaped payload (an email, optionally a name) becomes a real CRM
  // contact automatically -- this is the actual reason external tools
  // (landing pages, waitlists) get pointed at this endpoint: not just to
  // log a blob for someone to read later, but to register the lead.
  const obj = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const email = typeof obj.email === "string" ? obj.email.trim() : "";
  const name = typeof obj.name === "string" ? obj.name.trim() || null : null;
  const phone = typeof obj.phone === "string" ? obj.phone.trim().slice(0, 40) || null : null;
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    await recordContactActivity({
      email,
      name,
      activityType: "webhook_lead",
      source: safeSlug,
      sourceRecordId: eventResult.rows[0].id,
      phone,
      metadata: { name, email, phone },
    }).catch((err) => console.error(`inbound webhook (${safeSlug}) contact sync failed (non-fatal):`, err));

    // Hitting this endpoint means someone filled out an external lead form
    // with intent to be contacted -- the same bar as a newsletter double
    // opt-in or a booked call, so it earns the same automatic subscribe.
    await confirmContactSubscribed(email).catch((err) => console.error(`inbound webhook (${safeSlug}) subscribe failed (non-fatal):`, err));

  }

  let eventEmitted = false;
  await emitWebhookEvent({
    eventType: "external_webhook.received",
    source: "webhook_events",
    sourceRecordId: eventResult.rows[0].id,
    contactEmail: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    contactName: name,
    data: {
      source_slug: safeSlug,
      payload: obj,
    },
  }).then(() => { eventEmitted = true; }).catch((err) => console.error("Inbound webhook workflow event failed (non-fatal):", err));

  // Keep the existing welcome email as a fallback. Once a visual workflow
  // filters for this source slug and sends email, it owns the channel so the
  // lead does not receive duplicate messages.
  if (safeSlug === "open-cloud-crm" && email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const managed = eventEmitted && await hasActiveInboundWebhookAction(safeSlug, "email").catch(() => false);
    if (!managed) await sendOpenCloudCrmWelcomeEmailOnce(email, name);
  }

  return NextResponse.json({ ok: true });
}
