import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { resolveEmailBodySave } from "@/lib/emailBlockSave";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const { subject, html, segmentId, fromEmail, blocks } = await req.json();
  if (subject !== undefined && (typeof subject !== "string" || !subject.trim())) {
    return NextResponse.json({ error: "Add a subject before saving this campaign." }, { status: 400 });
  }
  if (fromEmail !== undefined && fromEmail !== null && fromEmail !== "" && !EMAIL_RE.test(String(fromEmail))) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }
  if (segmentId !== undefined) {
    const segment = await pool.query("SELECT 1 FROM contact_segments WHERE id = $1", [Number(segmentId)]);
    if (!segment.rowCount) return NextResponse.json({ error: "Choose a valid segment." }, { status: 400 });
  }

  const content = html !== undefined ? resolveEmailBodySave({ bodyHtml: String(html), blocks }) : null;
  const result = await pool.query(
    `UPDATE newsletter_campaigns
     SET subject = COALESCE($1, subject), html = COALESCE($2, html),
         segment_id = COALESCE($3, segment_id), from_email = COALESCE($4, from_email),
         blocks_json = CASE WHEN $6::boolean THEN $7::jsonb ELSE blocks_json END
     WHERE id = $5 AND status = 'draft'
     RETURNING id`,
    [subject || null, content?.bodyHtml ?? null, segmentId === undefined ? null : Number(segmentId), fromEmail || null, Number(id), blocks !== undefined, content?.blocks ? JSON.stringify(content.blocks) : null]
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
