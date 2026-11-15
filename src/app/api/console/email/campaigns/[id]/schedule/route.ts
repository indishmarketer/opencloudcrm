import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { parseIndiaDateTime } from "@/lib/indiaTime";
import { unsupportedCampaignVariables } from "@/lib/messageVariables";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid campaign." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const scheduledAt = parseIndiaDateTime(body.scheduledAt);
  if (!scheduledAt) return NextResponse.json({ error: "Choose a valid future date and time in IST." }, { status: 400 });
  const campaign = await pool.query("SELECT subject, html FROM newsletter_campaigns WHERE id = $1", [Number(id)]);
  if (campaign.rows[0]) {
    const unsupported = unsupportedCampaignVariables(campaign.rows[0].subject, campaign.rows[0].html);
    if (unsupported.length) return NextResponse.json({ error: `Campaigns cannot fill these attributes: ${unsupported.join(", ")}.` }, { status: 400 });
  }

  const result = await pool.query(
    `UPDATE newsletter_campaigns
     SET status = 'scheduled', scheduled_at = $1, last_error = NULL
     WHERE id = $2 AND status IN ('draft', 'scheduled')
       AND length(trim(subject)) > 0 AND length(trim(html)) > 0 AND html <> '<p></p>'
     RETURNING id`,
    [scheduledAt, Number(id)],
  );
  if (!result.rowCount) {
    const exists = await pool.query("SELECT status FROM newsletter_campaigns WHERE id = $1", [Number(id)]);
    if (!exists.rowCount) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    return NextResponse.json({ error: "Add a subject and email content, or cancel its current send before scheduling." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, scheduledAt: scheduledAt.toISOString() });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid campaign." }, { status: 400 });
  const result = await pool.query(
    `UPDATE newsletter_campaigns SET status = 'draft', scheduled_at = NULL
     WHERE id = $1 AND status = 'scheduled' RETURNING id`,
    [Number(id)],
  );
  if (!result.rowCount) return NextResponse.json({ error: "No scheduled campaign found." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
