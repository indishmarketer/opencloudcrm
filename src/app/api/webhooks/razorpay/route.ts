import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sendEmailWithRetry } from "@/lib/emailOutbox";
import { raiseAlert } from "@/lib/systemAlerts";
import { handleRefund, handleDispute } from "@/lib/paymentRefunds";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { escapeHtml } from "@/lib/escapeHtml";
import { verifyRazorpayPurchaseToken } from "@/lib/razorpayPurchaseToken";
import { grantCoursePurchase } from "@/lib/coursePurchaseGrant";
import { resolvePurchase } from "@/lib/paymentOrders";
import { fetchRazorpayOrder, getRazorpayKeyId, notesValue } from "@/lib/razorpay";
import { getDirectoryListingOrder, settleDirectoryListingPayment } from "@/lib/directoryListingPayments";
import { emailAt } from "@/config/brand";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { pool } from "@/lib/db";

function entity(payload: unknown, key: string): Record<string, unknown> {
  const outer = payload && typeof payload === "object" ? (payload as Record<string, unknown>)[key] : null;
  const inner = outer && typeof outer === "object" ? (outer as Record<string, unknown>).entity : null;
  return inner && typeof inner === "object" ? (inner as Record<string, unknown>) : {};
}

const str = (value: unknown) => (typeof value === "string" && value ? value : null);
const rupees = (paise: unknown) => (typeof paise === "number" ? paise / 100 : null);

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function POST(req: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });

  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > 256 * 1024) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }
  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody) > 256 * 1024) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }
  const signature = req.headers.get("x-razorpay-signature");
  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const eventName = body && typeof body === "object" ? (body as { event?: unknown }).event : null;
  const eventPayload = body && typeof body === "object" ? (body as { payload?: unknown }).payload : null;

  // Needs "refund.processed" and "payment.dispute.created" ticked on the
  // webhook in the Razorpay dashboard.
  if (eventName === "refund.processed") {
    const refund = entity(eventPayload, "refund");
    const payment = entity(eventPayload, "payment");
    const paymentRef = str(refund.payment_id) || str(payment.id);
    const refundId = str(refund.id);
    if (!paymentRef || !refundId) return NextResponse.json({ ok: true, skipped: "refund without ids" });
    const outcome = await handleRefund({
      method: "razorpay",
      reference: paymentRef,
      refundId,
      amount: rupees(refund.amount),
      totalRefunded: rupees(payment.amount_refunded),
    });
    return NextResponse.json({ ok: true, refund: outcome });
  }
  if (eventName === "payment.dispute.created") {
    const dispute = entity(eventPayload, "dispute");
    const paymentRef = str(dispute.payment_id) || str(entity(eventPayload, "payment").id);
    if (!paymentRef) return NextResponse.json({ ok: true, skipped: "dispute without payment id" });
    await handleDispute({
      method: "razorpay",
      reference: paymentRef,
      disputeId: str(dispute.id) || paymentRef,
      reason: str(dispute.reason_description) || str(dispute.reason_code),
    });
    return NextResponse.json({ ok: true });
  }

  if (eventName === "payment.failed") {
    const failedPayment = entity(eventPayload, "payment");
    const paymentId = str(failedPayment.id);
    const orderId = str(failedPayment.order_id);
    if (!paymentId || !orderId) return NextResponse.json({ ok: true, skipped: "failed payment without ids" });
    const purchase = await resolvePurchase("razorpay", orderId, null);
    if (!purchase) return NextResponse.json({ ok: true, skipped: "failed payment not matched to a course order" });
    const buyer = await pool.query(
      "SELECT u.email, u.name, c.id AS course_id, c.title AS course_title FROM users u JOIN courses c ON c.id = $2 WHERE u.id = $1",
      [purchase.userId, purchase.courseId],
    );
    if (!buyer.rows[0]?.email) return NextResponse.json({ ok: true, skipped: "failed payment buyer not found" });
    await emitWebhookEvent({
      eventType: "payment.failed",
      source: "razorpay_failed_payments",
      sourceRecordId: paymentId,
      contactEmail: buyer.rows[0].email,
      contactName: buyer.rows[0].name,
      userId: purchase.userId,
      data: {
        payment_id: paymentId,
        order_id: orderId,
        course_id: buyer.rows[0].course_id,
        course_title: buyer.rows[0].course_title,
        failure_code: str(failedPayment.error_code),
        failure_description: str(failedPayment.error_description),
      },
    });
    return NextResponse.json({ ok: true, queued: true });
  }
  if (eventName !== "payment.captured") {
    return NextResponse.json({ ok: true, skipped: "irrelevant event" });
  }

  const paymentEntity = entity(eventPayload, "payment");
  const paymentId = str(paymentEntity.id);
  const payerEmail = str(paymentEntity.email) || undefined;

  if (paymentEntity.status !== "captured" || paymentEntity.captured !== true) {
    return NextResponse.json({ error: "Payment is not captured." }, { status: 400 });
  }

  // Our payment_orders row names the buyer and never expires, so a webhook
  // retried days later still matches. Orders from before that table fall
  // back to the signed token on the order's (or older payment's) notes.
  const orderId = str(paymentEntity.order_id);
  if (orderId && paymentId) {
    const listingOrder = await getDirectoryListingOrder("razorpay", orderId);
    if (listingOrder) {
      const outcome = await settleDirectoryListingPayment({
        provider: "razorpay",
        providerOrderId: orderId,
        paymentReference: paymentId,
        amountMinor: typeof paymentEntity.amount === "number" ? paymentEntity.amount : 0,
        currency: str(paymentEntity.currency),
      });
      if (outcome === "mismatch") return NextResponse.json({ error: "Directory listing amount or order mismatch." }, { status: 400 });
      if (outcome === "unmatched") return NextResponse.json({ error: "Directory listing order not found." }, { status: 404 });
      return NextResponse.json({ ok: true, result: outcome });
    }
  }

  let purchase = await resolvePurchase("razorpay", orderId, null);
  if (!purchase) {
    let token = notesValue(paymentEntity.notes, "purchase_token");
    if (!token && orderId && getRazorpayKeyId()) {
      try {
        token = notesValue((await fetchRazorpayOrder(orderId)).notes, "purchase_token");
      } catch (e) {
        // Let Razorpay retry rather than alerting on a transient API blip.
        console.error("Razorpay webhook could not fetch order:", e);
        return NextResponse.json({ error: "Could not load order." }, { status: 502 });
      }
    }
    const fromToken = await verifyRazorpayPurchaseToken(token);
    purchase = fromToken && {
      userId: fromToken.userId,
      courseId: fromToken.courseId,
      expectedMinor: fromToken.amountPaise,
      expectedCurrency: fromToken.currency,
    };
  }

  // Never infer ownership from attacker-controlled payment fields; alert the
  // owner for manual reconciliation instead.
  if (!paymentId || !purchase) {
    await raiseAlert({
      kind: "payment_unmatched",
      dedupeKey: `payment_unmatched:razorpay:${paymentId || payerEmail || Date.now()}`,
      severity: "critical",
      title: `Razorpay payment ${paymentId || "(no id)"} could not be matched to an account`,
      detail: `Payer email: ${payerEmail || "unknown"}. Find the buyer and grant access by hand, then mark this resolved.`,
      link: "/console/courses/students",
    });
    const alertTpl = await getEmailTemplate("razorpay-unmatched-payment-alert");
    const alertVars = {
      payment_id: escapeHtml(paymentId || "unknown"),
      payer_email: escapeHtml(payerEmail || "unknown"),
    };
    await sendEmailWithRetry({
      to: emailAt("support"),
      subject: applyTemplateVars(alertTpl.subject, alertVars),
      html: applyTemplateVars(alertTpl.body_html, alertVars),
      from: alertTpl.from_email,
      critical: alertTpl.critical,
      templateKey: alertTpl.key,
      category: "fixed",
      trackOpens: alertTpl.track_opens,
    });
    return NextResponse.json({ ok: true, skipped: "could not match user/course, owner alerted" });
  }

  const result = await grantCoursePurchase({
    method: "razorpay",
    reference: paymentId,
    userId: purchase.userId,
    courseId: purchase.courseId,
    paidMinor: typeof paymentEntity.amount === "number" ? paymentEntity.amount : null,
    paidCurrency: str(paymentEntity.currency),
    expectedMinor: purchase.expectedMinor,
    expectedCurrency: purchase.expectedCurrency,
    providerOrderId: orderId,
    phone: str(paymentEntity.contact),
  });
  if (result === "failed") {
    return NextResponse.json({ ok: false, error: "enrollment transaction failed, owner alerted" }, { status: 500 });
  }
  if (result === "mismatch") {
    return NextResponse.json({ error: "Payment amount or course binding mismatch." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, result });
}
