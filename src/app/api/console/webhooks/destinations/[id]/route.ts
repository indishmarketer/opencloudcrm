import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { validateOutboundWebhookUrl } from "@/lib/webhookUrlValidation";
import { isValidWebhookEventType } from "@/lib/webhookEventCatalogue";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const destinationId = Number(id);
  if (!Number.isInteger(destinationId)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (typeof body.name === "string") {
    sets.push(`name = $${i++}`);
    values.push(body.name.slice(0, 200));
  }
  if (typeof body.url === "string") {
    const validation = await validateOutboundWebhookUrl(body.url);
    if (!validation.ok) return NextResponse.json({ error: validation.reason }, { status: 400 });
    sets.push(`url = $${i++}`);
    values.push(body.url.slice(0, 2000));
  }
  if (typeof body.enabled === "boolean") {
    sets.push(`enabled = $${i++}`);
    values.push(body.enabled);
  }
  if (Array.isArray(body.event_types)) {
    const eventTypes = body.event_types.filter((e: unknown) => typeof e === "string" && isValidWebhookEventType(e));
    sets.push(`event_types = $${i++}`);
    values.push(eventTypes);
  }
  if (typeof body.description === "string" || body.description === null) {
    sets.push(`description = $${i++}`);
    values.push(body.description ? String(body.description).slice(0, 500) : null);
  }

  if (sets.length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  sets.push(`updated_at = now()`);
  values.push(destinationId);

  const result = await pool.query(
    `UPDATE webhook_destinations SET ${sets.join(", ")} WHERE id = $${i} RETURNING id`,
    values
  );
  if (result.rowCount === 0) return NextResponse.json({ error: "Destination not found." }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const destinationId = Number(id);
  if (!Number.isInteger(destinationId)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  await pool.query("DELETE FROM webhook_destinations WHERE id = $1", [destinationId]);
  return NextResponse.json({ ok: true });
}
