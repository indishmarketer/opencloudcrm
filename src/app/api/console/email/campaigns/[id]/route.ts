import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { emailAt } from "@/config/brand";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await pool.query(
    "SELECT id, subject, html, status, audience, from_email, segment_id FROM newsletter_campaigns WHERE id = $1",
    [Number(id)]
  );
  if (result.rows.length === 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ campaign: result.rows[0] });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { subject, html, segmentId, fromEmail } = await req.json();
  const allowedSenders = new Set([emailAt("support"), emailAt("reach"), emailAt("academy")]);
  if (fromEmail !== undefined && !allowedSenders.has(String(fromEmail))) {
    return NextResponse.json({ error: "Choose a verified sending address." }, { status: 400 });
  }
  if (segmentId !== undefined) {
    const segment = await pool.query("SELECT 1 FROM contact_segments WHERE id = $1", [Number(segmentId)]);
    if (!segment.rowCount) return NextResponse.json({ error: "Choose a valid segment." }, { status: 400 });
  }

  const result = await pool.query(
    `UPDATE newsletter_campaigns
     SET subject = COALESCE($1, subject), html = COALESCE($2, html),
         segment_id = COALESCE($3, segment_id), from_email = COALESCE($4, from_email)
     WHERE id = $5 AND status = 'draft'
     RETURNING id`,
    [subject || null, html || null, segmentId === undefined ? null : Number(segmentId), fromEmail || null, Number(id)]
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Campaign not found, or it's already been sent." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  // Any status, draft or already-sent -- newsletter_sends rows cascade-delete
  // with it, and email_deliveries.campaign_id is set null (per-recipient
  // open/click history stays, just detached from the deleted campaign).
  const result = await pool.query("DELETE FROM newsletter_campaigns WHERE id = $1", [Number(id)]);
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
