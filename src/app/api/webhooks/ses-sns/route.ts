import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { pool } from "@/lib/db";
import { ensureContact, markContactSuppressed } from "@/lib/contacts";
import { verifySnsSignature, type SnsMessage } from "@/lib/snsVerify";
import { emitWebhookEvent } from "@/lib/webhookEvents";

/** Amazon SES's bounce/complaint/delivery feed, via an Amazon SNS HTTPS
 * subscription. Two independent checks gate every request, both required:
 *
 * 1. A shared-secret query param --
 *    set when the SNS subscription's endpoint URL is created:
 *    <your site>/api/webhooks/ses-sns?secret=<SES_SNS_WEBHOOK_SECRET>
 * 2. The message's AWS signature (verifySnsSignature) AND its TopicArn
 *    matching SES_SNS_TOPIC_ARN exactly. The signature alone only proves
 *    *some* real SNS topic sent it -- anyone with any AWS account could
 *    create their own topic, subscribe this URL, and sign fake bounce data
 *    without the ARN check.
 *
 * Feeds the suppression list and the email_deliveries/email_events tables
 * behind the console's email analytics. */

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.SES_SNS_WEBHOOK_SECRET;
  if (!secret) return false;
  const provided = req.nextUrl.searchParams.get("secret") || "";
  if (provided.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}

type SesMailObject = { messageId: string; destination?: string[] };
type SesBounce = {
  bounceType: "Permanent" | "Transient" | "Undetermined";
  bouncedRecipients: { emailAddress: string }[];
};
type SesComplaint = { complainedRecipients: { emailAddress: string }[]; complaintFeedbackType?: string };
type SesDelivery = { recipients: string[] };
type SesNotification = {
  notificationType: "Bounce" | "Complaint" | "Delivery";
  mail: SesMailObject;
  bounce?: SesBounce;
  complaint?: SesComplaint;
  delivery?: SesDelivery;
};

async function recordEvent(opts: {
  email: string;
  event: string;
  messageId: string | null;
  providerEventKey: string;
  meta: Record<string, unknown>;
}) {
  let deliveryId: number | null = null;
  let contactId: number | null = null;
  let templateKey: string | null = null;
  let category = "unknown";
  if (opts.messageId) {
    const matched = await pool.query(
      `SELECT id, contact_id, template_key, category FROM email_deliveries WHERE provider_message_id = $1 LIMIT 1`,
      [opts.messageId]
    );
    if (matched.rows[0]) {
      deliveryId = Number(matched.rows[0].id);
      contactId = matched.rows[0].contact_id ? Number(matched.rows[0].contact_id) : null;
      templateKey = matched.rows[0].template_key;
      category = matched.rows[0].category;
    }
  }
  if (!contactId) contactId = await ensureContact({ email: opts.email });

  const inserted = await pool.query(
    `INSERT INTO email_events
       (delivery_id, template_key, category, recipient_email, message_id, event, meta, provider_event_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (provider_event_key) WHERE provider_event_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [deliveryId, templateKey, category, opts.email.toLowerCase(), opts.messageId, opts.event,
     JSON.stringify(opts.meta), opts.providerEventKey]
  );
  return { inserted: (inserted.rowCount ?? 0) > 0, deliveryId };
}

async function handleNotification(note: SesNotification) {
  const sesMessageId = note.mail?.messageId || null;

  if (note.notificationType === "Delivery" && note.delivery) {
    for (const email of note.delivery.recipients) {
      const { inserted, deliveryId } = await recordEvent({
        email, event: "delivered", messageId: sesMessageId,
        providerEventKey: `ses:${sesMessageId}:delivered:${email.toLowerCase()}`,
        meta: { source: "ses" },
      });
      if (inserted && deliveryId) {
        await pool.query(
          "UPDATE email_deliveries SET status = 'delivered', delivered_at = COALESCE(delivered_at, now()) WHERE id = $1",
          [deliveryId]
        );
      }
    }
    return;
  }

  if (note.notificationType === "Bounce" && note.bounce) {
    const isHard = note.bounce.bounceType === "Permanent";
    for (const r of note.bounce.bouncedRecipients) {
      const email = r.emailAddress;
      const { inserted, deliveryId } = await recordEvent({
        email, event: isHard ? "hard_bounce" : "soft_bounce", messageId: sesMessageId,
        providerEventKey: `ses:${sesMessageId}:bounce:${email.toLowerCase()}`,
        meta: { source: "ses", bounce_type: note.bounce.bounceType },
      });
      if (!inserted) continue;
      if (deliveryId) {
        await pool.query(
          "UPDATE email_deliveries SET status = 'bounced', failed_at = now(), last_error = $2 WHERE id = $1",
          [deliveryId, note.bounce.bounceType]
        );
      }
      // A soft bounce (full inbox, temporary issue) may still be
      // deliverable later; only a hard bounce means "never again".
      if (isHard) {
        await pool.query("INSERT INTO email_suppressions (email) VALUES ($1) ON CONFLICT DO NOTHING", [
          email.toLowerCase(),
        ]);
        await markContactSuppressed(email, "bounced");
      }
      await emitWebhookEvent({
        eventType: "email.bounced",
        source: "ses_email_events",
        sourceRecordId: `bounce:${sesMessageId || "unknown"}:${email.toLowerCase()}`,
        contactEmail: email,
        data: { bounce_type: note.bounce.bounceType, permanent: isHard },
      });
    }
    return;
  }

  if (note.notificationType === "Complaint" && note.complaint) {
    for (const r of note.complaint.complainedRecipients) {
      const email = r.emailAddress;
      const { inserted, deliveryId } = await recordEvent({
        email, event: "spam", messageId: sesMessageId,
        providerEventKey: `ses:${sesMessageId}:complaint:${email.toLowerCase()}`,
        meta: { source: "ses", feedback_type: note.complaint.complaintFeedbackType || null },
      });
      if (!inserted) continue;
      if (deliveryId) {
        await pool.query(
          "UPDATE email_deliveries SET status = 'complained', failed_at = now(), last_error = 'spam complaint' WHERE id = $1",
          [deliveryId]
        );
      }
      await pool.query("INSERT INTO email_suppressions (email) VALUES ($1) ON CONFLICT DO NOTHING", [
        email.toLowerCase(),
      ]);
      await markContactSuppressed(email, "complained");
      await emitWebhookEvent({
        eventType: "email.complained",
        source: "ses_email_events",
        sourceRecordId: `complaint:${sesMessageId || "unknown"}:${email.toLowerCase()}`,
        contactEmail: email,
        data: { feedback_type: note.complaint.complaintFeedbackType || null },
      });
    }
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > 256 * 1024) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  // SNS POSTs JSON but with a text/plain content-type, so req.json() can't
  // be trusted to parse it -- read the raw body ourselves.
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  let msg: SnsMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const expectedTopicArn = process.env.SES_SNS_TOPIC_ARN;
  if (!expectedTopicArn || msg.TopicArn !== expectedTopicArn) {
    return NextResponse.json({ error: "Unrecognized topic." }, { status: 403 });
  }

  const validSignature = await verifySnsSignature(msg);
  if (!validSignature) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
  }

  if (msg.Type === "SubscriptionConfirmation") {
    // Auto-confirm: GETting SubscribeURL is exactly what clicking "Confirm
    // subscription" in the SNS console does, and it only works because we
    // already verified this message was genuinely signed by AWS above.
    if (msg.SubscribeURL) {
      try {
        await fetch(msg.SubscribeURL, { signal: AbortSignal.timeout(10000) });
      } catch (error) {
        console.error("SES SNS subscription confirmation fetch failed:", error);
        return NextResponse.json({ error: "Could not confirm subscription." }, { status: 502 });
      }
    }
    return NextResponse.json({ ok: true, confirmed: true });
  }

  if (msg.Type === "UnsubscribeConfirmation") {
    // Someone (deliberately, via the console) unsubscribed this endpoint --
    // nothing to clean up, just acknowledge.
    return NextResponse.json({ ok: true });
  }

  if (msg.Type !== "Notification") {
    return NextResponse.json({ ok: true, skipped: "unrecognized message type" });
  }

  let note: SesNotification;
  try {
    note = JSON.parse(msg.Message);
  } catch {
    return NextResponse.json({ error: "Invalid notification payload." }, { status: 400 });
  }

  try {
    await handleNotification(note);
  } catch (error) {
    console.error("SES SNS notification handling failed:", error);
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
