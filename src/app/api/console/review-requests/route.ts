import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail } from "@/lib/auth";
import { dispatchDueReviewRequests, queueGoogleReviewRequest } from "@/lib/reviewRequests";

export async function POST(req: NextRequest) {
  const adminEmail = await getAdminSessionEmail();
  if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const contactId = Number(body.contactId);
    const scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : new Date();
    if (!Number.isInteger(contactId) || Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() < Date.now() - 60_000) {
      return NextResponse.json({ error: "Choose a valid contact and schedule time." }, { status: 400 });
    }

    let id: number;
    let whatsappId: number | null = null;
    let whatsappError: string | null = null;
    if (body.channel === "whatsapp") {
      id = await queueGoogleReviewRequest({
        contactId,
        channel: "whatsapp",
        whatsappTemplateKey: String(body.whatsappTemplateKey || "customer_review_request"),
        scheduledFor,
        requestedByEmail: adminEmail,
      });
    } else {
      id = await queueGoogleReviewRequest({
        contactId,
        templateKey: String(body.templateKey || "google-review-request"),
        scheduledFor,
        requestedByEmail: adminEmail,
      });
      // The review hub sends email and WhatsApp together when the contact
      // has a number; the WhatsApp is best-effort so an email already
      // queued is never thrown away by a WhatsApp-only problem.
      if (body.whatsappTemplateKey) {
        try {
          whatsappId = await queueGoogleReviewRequest({
            contactId,
            channel: "whatsapp",
            whatsappTemplateKey: String(body.whatsappTemplateKey),
            scheduledFor,
            requestedByEmail: adminEmail,
          });
        } catch (error) {
          whatsappError = error instanceof Error ? error.message : "Could not queue WhatsApp review request";
        }
      }
    }

    if (!body.scheduledFor) await dispatchDueReviewRequests(25);
    return NextResponse.json({ ok: true, id, whatsappId, whatsappError });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not queue review request" }, { status: 400 });
  }
}
