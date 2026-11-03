import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { dispatchDueEmailWork } from "@/lib/emailDispatcher";
import { syncVoiceAgentInterestFlows } from "@/lib/emailAutomation";
import { sendPendingCampaignBatch as sendPendingWhatsAppBatch } from "@/lib/whatsappCampaigns";
import { dispatchWorkflowRuns } from "@/lib/workflows";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const expected = secret ? `Bearer ${secret}` : null;
  const authorized = !!expected && !!auth && expected.length === auth.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(auth));
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await syncVoiceAgentInterestFlows();
  const result = await dispatchDueEmailWork();
  // WhatsApp campaigns drain on this same five-minute schedule rather than
  // on a cron of their own: the VPS crontab is edited by hand, and a new
  // entry is one more thing to set up (and forget) on a rebuild. Failures
  // are isolated so a WhatsApp problem cannot stop email work.
  const whatsapp = await sendPendingWhatsAppBatch(25).catch((err) => {
    console.error("WhatsApp campaign batch failed:", err);
    return { sent: 0, skipped: 0, failed: 0 };
  });
  const workflows = await dispatchWorkflowRuns(5).catch((err) => {
    console.error("Workflow run batch failed:", err);
    return { completed: 0, failed: 0, waiting: 0 };
  });
  return NextResponse.json({ ok: true, ...result, whatsapp, workflows });
}
