import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { unsupportedCampaignVariables } from "@/lib/messageVariables";

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await pool.query(`
    SELECT c.id, c.name, c.subject, c.status, c.audience, c.from_email, c.created_at, c.sent_at,
      c.segment_id, seg.name AS segment_name, c.last_error, c.source_post_slug,
      COUNT(s.id) FILTER (WHERE s.status = 'sent')::int AS sent_count,
      COUNT(s.id) FILTER (WHERE s.status = 'skipped')::int AS skipped_count,
      COUNT(s.id) FILTER (WHERE s.status = 'failed')::int AS failed_count,
      COUNT(s.id)::int AS recipient_count,
      COUNT(s.id) FILTER (WHERE ed.first_opened_at IS NOT NULL)::int AS opened_count,
      COUNT(s.id) FILTER (WHERE ed.first_clicked_at IS NOT NULL)::int AS clicked_count,
      COUNT(s.id) FILTER (WHERE ed.status IN ('bounced', 'complained'))::int AS bounced_count
    FROM newsletter_campaigns c
    LEFT JOIN contact_segments seg ON seg.id = c.segment_id
    LEFT JOIN newsletter_sends s ON s.campaign_id = c.id
    LEFT JOIN email_deliveries ed ON ed.id = s.email_delivery_id
    GROUP BY c.id, seg.name
    ORDER BY c.created_at DESC
  `);
  return NextResponse.json({ campaigns: result.rows });
}

export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, templateId } = await req.json();
  if (typeof name !== "string" || !name.trim() || name.trim().length > 120) {
    return NextResponse.json({ error: "Enter a campaign name (up to 120 characters)." }, { status: 400 });
  }

  let template: { subject: string; body_html: string; blocks_json: unknown } | undefined;
  if (templateId !== undefined) {
    const found = await pool.query("SELECT subject, body_html, blocks_json FROM email_content_templates WHERE id = $1 AND category = 'marketing'", [Number(templateId)]);
    template = found.rows[0];
    if (!template) return NextResponse.json({ error: "Choose a marketing template." }, { status: 400 });
    const unsupported = unsupportedCampaignVariables(template.subject, template.body_html);
    if (unsupported.length) return NextResponse.json({ error: `This template needs workflow data unavailable to campaigns: ${unsupported.join(", ")}.` }, { status: 400 });
  }
  const result = await pool.query(
    `INSERT INTO newsletter_campaigns (name, subject, html, status, segment_id, blocks_json)
     VALUES ($1, $2, $3, 'draft',
       (SELECT id FROM contact_segments WHERE name = 'All marketable contacts' AND is_system = true LIMIT 1), $4::jsonb)
     RETURNING id`,
    [name.trim(), template?.subject ?? "", template?.body_html ?? "", template?.blocks_json ? JSON.stringify(template.blocks_json) : null]
  );
  return NextResponse.json({ id: result.rows[0].id });
}
