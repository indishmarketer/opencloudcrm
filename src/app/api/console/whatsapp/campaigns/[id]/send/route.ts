import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rateLimit";
import { queueCampaignRecipients, sendPendingCampaignBatch } from "@/lib/whatsappCampaigns";

/** Starts a campaign: everyone who matches is queued, the first batch goes
 * out now, and the five-minute dispatcher finishes the rest.
 *
 * The batch is small (15) on purpose. WhatsApp caps business-initiated
 * conversations per 24 hours by messaging tier, and a number that suddenly
 * sends far more than usual gets its quality rating cut; a slow drain
 * through the dispatcher is both safer and recoverable if something is
 * wrong with the message. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isInteger(campaignId)) return NextResponse.json({ error: "Invalid campaign." }, { status: 400 });

  if (!(await consumeRateLimit("whatsapp-campaign-send", 10, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many campaigns started in the last hour." }, { status: 429 });
  }

  const campaign = await pool.query<{ status: string }>(
    "SELECT status FROM whatsapp_campaigns WHERE id = $1",
    [campaignId],
  );
  if (!campaign.rows[0]) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (campaign.rows[0].status !== "draft") {
    return NextResponse.json({ error: "This campaign has already been sent." }, { status: 409 });
  }

  let queued: number;
  try {
    queued = await queueCampaignRecipients(campaignId);
  } catch (err) {
    if (err instanceof Error && err.message === "campaign_not_draft") {
      return NextResponse.json({ error: "This campaign is already sending." }, { status: 409 });
    }
    throw err;
  }

  if (queued === 0) {
    return NextResponse.json({
      ok: true,
      queued: 0,
      sent: 0,
      message: "Nobody in that audience has opted in to WhatsApp with a usable number, so nothing was sent.",
    });
  }

  const { sent, skipped, failed } = await sendPendingCampaignBatch(15, campaignId);
  return NextResponse.json({ ok: true, queued, sent, skipped, failed });
}
