import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await pool.query(`
    SELECT c.id, c.subject, c.status, c.audience, c.from_email, c.created_at, c.sent_at,
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

  const { subject } = await req.json();
  if (!subject || typeof subject !== "string" || !subject.trim()) {
    return NextResponse.json({ error: "Subject is required." }, { status: 400 });
  }

  const result = await pool.query(
    `INSERT INTO newsletter_campaigns (subject, html, status, segment_id)
     VALUES ($1, '<p></p>', 'draft',
       (SELECT id FROM contact_segments WHERE name = 'All marketable contacts' AND is_system = true LIMIT 1))
     RETURNING id`,
    [subject.trim()]
  );
  return NextResponse.json({ id: result.rows[0].id });
}
