import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { ensureCampaignBehaviorSegments, queueCampaignRecipients, sendPendingCampaignBatch } from "@/lib/campaigns";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const campaignId = Number(id);

  const result = await pool.query(
    "SELECT subject, html FROM newsletter_campaigns WHERE id = $1 AND status = 'draft'",
    [campaignId]
  );
  const campaign = result.rows[0];
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found, or it's already been sent." }, { status: 404 });
  }
  if (!campaign.subject?.trim() || !campaign.html?.trim() || campaign.html === "<p></p>") {
    return NextResponse.json({ error: "Add a subject and some content before sending." }, { status: 400 });
  }

  let queued: number;
  try {
    queued = await queueCampaignRecipients(campaignId);
  } catch (err) {
    if (err instanceof Error && err.message === "campaign_not_draft") {
      return NextResponse.json({ error: "Campaign is already sending or no longer a draft." }, { status: 409 });
    }
    throw err;
  }
  await ensureCampaignBehaviorSegments(campaignId, campaign.subject);
  if (queued === 0) {
    await pool.query("UPDATE newsletter_campaigns SET status = 'sent', sent_at = now() WHERE id = $1", [
      campaignId,
    ]);
    return NextResponse.json({ ok: true, queued: 0, sent: 0, message: "No matching subscribers to send to." });
  }

  // First batch goes out synchronously so a normal-sized list sends
  // immediately on click; anything beyond the batch limit is mopped up by
  // the recurring email dispatcher (see src/lib/campaigns.ts).
  const { sent, skipped, failed } = await sendPendingCampaignBatch(25, campaignId);

  return NextResponse.json({ ok: true, queued, sent, skipped, failed });
}
