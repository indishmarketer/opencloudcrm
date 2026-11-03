import { pool, withTransaction } from "@/lib/db";
import { sendEmailWithRetry } from "@/lib/emailOutbox";
import { raiseAlert } from "@/lib/systemAlerts";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { triggerEmailFlow, firstNameOf } from "@/lib/emailAutomation";
import { escapeHtml } from "@/lib/escapeHtml";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { sendMetaEvent } from "@/lib/metaCapi";
import { sendGa4Purchase, gaCookiesFrom } from "@/lib/ga4Server";
import { markOrderPaid } from "@/lib/paymentOrders";
import { sendTransactionalWhatsApp } from "@/lib/whatsappTransactional";
import { ensureContact } from "@/lib/contacts";
import { SITE_URL } from "@/config/brand";

export type PaymentMethod = "razorpay" | "paypal";

/** Browser details captured on the request that confirmed the payment, so
 * Meta can match the server-side Purchase to the ad click. The webhook
 * fallback has none of these and sends email + user id only. */
export type ConversionClient = {
  ip?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  gaClientId?: string | null;
  gaSessionId?: string | null;
};

export function conversionClientFrom(req: {
  headers: Headers;
  cookies: { get(name: string): { value: string } | undefined };
}): ConversionClient {
  return {
    ip: req.headers.get("cf-connecting-ip"),
    userAgent: req.headers.get("user-agent"),
    fbp: req.cookies.get("_fbp")?.value ?? null,
    fbc: req.cookies.get("_fbc")?.value ?? null,
    ...gaCookiesFrom(req.cookies),
  };
}

const PROVIDER_LABEL: Record<PaymentMethod, string> = { razorpay: "Razorpay", paypal: "PayPal" };

export type GrantResult =
  | "granted"
  | "already_recorded"
  | "unknown_course"
  | "unknown_user"
  | "mismatch"
  | "failed";

/** Grants PRO for a captured payment, for both gateways. Called by the
 * routes the buyer's browser waits on (Razorpay verify, PayPal return) and
 * by the webhooks (the fallback when the browser closes first). Whichever
 * arrives first wins the ON CONFLICT reservation; the other sees
 * "already_recorded". Amounts are in minor units (paise / cents); the
 * expected amount comes from the server-signed purchase token. */
export async function grantCoursePurchase(input: {
  method: PaymentMethod;
  reference: string;
  userId: number;
  courseId: number;
  paidMinor: number | null;
  paidCurrency: string | null;
  expectedMinor: number;
  expectedCurrency: string;
  client?: ConversionClient;
  /** The Razorpay/PayPal order id, marked paid in payment_orders. */
  providerOrderId?: string | null;
  /** The phone number the gateway's own checkout collected for this
   * payment (Razorpay's `contact` field, or PayPal's `payer.phone` when it
   * asked for one), if any. Digits only, calling code included. Used for
   * the WhatsApp confirmation below and saved to the account (unless a
   * number already on file, e.g. one the person entered themselves, wins). */
  phone?: string | null;
}): Promise<GrantResult> {
  const { method, userId } = input;
  const paymentId = input.reference;
  const provider = PROVIDER_LABEL[method];

  const existing = await pool.query("SELECT id FROM payment_claims WHERE method = $1 AND reference = $2", [
    method,
    paymentId,
  ]);
  if (existing.rows.length > 0) return "already_recorded";

  const courseResult = await pool.query(
    "SELECT id, slug, title FROM courses WHERE id = $1 AND published = true",
    [input.courseId],
  );
  const course = courseResult.rows[0];
  if (!course) return "unknown_course";
  const courseSlug: string = course.slug;

  const userResult = await pool.query("SELECT email, name FROM users WHERE id = $1", [userId]);
  const user = userResult.rows[0];
  if (!user) return "unknown_user";

  // The token's amount was computed by our server when the order was made
  // (a USD-priced course converts at that moment's rate), so the payment
  // must match the token, not a fresh price lookup.
  if (input.paidMinor !== input.expectedMinor || input.paidCurrency !== input.expectedCurrency) {
    await raiseAlert({
      kind: "payment_unmatched",
      dedupeKey: `payment_mismatch:${method}:${paymentId}`,
      severity: "critical",
      title: `${provider} payment ${paymentId} amount did not match the order`,
      detail: `Buyer: ${user.email}. Course: ${course.title}. Paid ${input.paidMinor == null ? "unknown" : input.paidMinor / 100} ${input.paidCurrency || ""}, expected ${input.expectedMinor / 100} ${input.expectedCurrency}. Check it in ${provider} and grant or refund by hand.`,
      link: "/console/courses/students",
    });
    return "mismatch";
  }
  const amount = input.expectedMinor / 100;
  const currency = input.expectedCurrency;

  // A different payment already bought this course (two tabs, or paid
  // twice). Still record this one, but tell the owner to refund it.
  const otherPaid = await pool.query(
    `SELECT id FROM payment_claims
     WHERE user_id = $1 AND course_id = $2 AND status = 'approved' AND refunded_at IS NULL AND reference IS NOT NULL
       AND NOT (method = $3 AND reference = $4)
     LIMIT 1`,
    [userId, course.id, method, paymentId],
  );
  const isDuplicatePayment = (otherPaid.rowCount ?? 0) > 0;

  const priorEnrollment = await pool.query(
    "SELECT tier FROM course_enrollments WHERE user_id = $1 AND course_id = $2",
    [userId, course.id],
  );
  const wasFreeBefore = priorEnrollment.rows[0]?.tier === "free";

  // Money already moved. If granting access fails, alert immediately rather
  // than leaving a paying customer with nothing and no one aware of it.
  let processed = false;
  let claimId: number | null = null;
  try {
    processed = await withTransaction(async (client) => {
      const claim = await client.query(
        `INSERT INTO payment_claims (user_id, course_id, method, reference, status, reviewed_at, amount, currency)
         VALUES ($1, $2, $3, $4, 'approved', now(), $5, $6)
         ON CONFLICT (method, reference) WHERE reference IS NOT NULL DO NOTHING
         RETURNING id`,
        [userId, course.id, method, paymentId, amount, currency],
      );
      if ((claim.rowCount ?? 0) === 0) return false;
      claimId = claim.rows[0].id;
      await client.query(
        `INSERT INTO course_enrollments (user_id, course_id, tier, granted_via)
         VALUES ($1, $2, 'pro', $3)
         ON CONFLICT (user_id, course_id) DO UPDATE SET tier = 'pro', granted_via = $3`,
        [userId, course.id, method],
      );
      await client.query(
        `INSERT INTO attribution_events (user_id, email, event_type, metadata)
         VALUES ($1, $2, 'payment', $3)`,
        [userId, user.email, JSON.stringify({ course_id: course.id, amount, currency, method })],
      );
      return true;
    });
  } catch (e) {
    console.error(`${provider} payment succeeded but transaction failed:`, e);
    await raiseAlert({
      kind: "payment_grant_failed",
      dedupeKey: `payment_grant_failed:${method}:${paymentId}`,
      severity: "critical",
      title: `${provider} payment from ${user.email} succeeded but course access was not granted`,
      detail: `Course: ${course.title}. Payment reference: ${paymentId}. Grant access by hand in Courses, then mark this resolved.`,
      link: "/console/courses/students",
    });
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      const failTpl = await getEmailTemplate("payment-grant-failed-alert");
      const failVars = {
        provider,
        payer_email: escapeHtml(user.email),
        course_title: escapeHtml(course.title),
        ref_label: method === "paypal" ? "capture" : "payment",
        payment_ref: escapeHtml(paymentId),
        amount: String(amount),
        currency: escapeHtml(currency),
      };
      await sendEmailWithRetry({
        to: adminEmail,
        subject: applyTemplateVars(failTpl.subject, failVars),
        html: applyTemplateVars(failTpl.body_html, failVars),
        from: failTpl.from_email,
        critical: failTpl.critical,
        templateKey: failTpl.key,
        category: "fixed",
        trackOpens: failTpl.track_opens,
      });
    }
    return "failed";
  }

  if (input.providerOrderId) await markOrderPaid(method, input.providerOrderId, paymentId).catch(() => {});
  if (!processed) return "already_recorded";

  if (isDuplicatePayment) {
    await raiseAlert({
      kind: "payment_duplicate",
      dedupeKey: `payment_duplicate:${method}:${paymentId}`,
      severity: "critical",
      title: `${user.email} paid twice for ${course.title}`,
      detail: `A second ${provider} payment (${paymentId}, ${amount} ${currency}) arrived for a course they already bought. Refund it in ${provider}; the refund webhook keeps their access because the first payment still covers it.`,
      link: "/console/courses/students",
    });
    return "granted";
  }

  const grantTpl = await getEmailTemplate("course-access-granted-pro");
  const grantVars = {
    first_name: escapeHtml(firstNameOf(user.name)),
    course_title: escapeHtml(course.title),
    course_url: `${SITE_URL}/account/courses/${encodeURIComponent(courseSlug)}`,
  };
  await sendEmailWithRetry({
    to: user.email,
    subject: applyTemplateVars(grantTpl.subject, grantVars),
    html: applyTemplateVars(grantTpl.body_html, grantVars),
    from: grantTpl.from_email,
    templateKey: grantTpl.key,
    category: "fixed",
    trackOpens: grantTpl.track_opens,
  });
  triggerEmailFlow(
    wasFreeBefore ? "course_upgrade_to_pro" : "course_purchase",
    user.email,
    {
      course_title: course.title,
      course_url: `${SITE_URL}/courses/${courseSlug}`,
      first_name: firstNameOf(user.name),
      payment_amount: String(amount),
      payment_currency: currency,
      payment_method: method,
      payment_reference: paymentId,
    },
    course.id,
  ).catch(() => {});

  // A gateway-returned number is saved to the account (so it's there next
  // time), but either way the number we message is whatever we end up
  // knowing: PayPal in particular only hands one back when it happened to
  // ask for it, so without this fallback a buyer whose number we already
  // had from signup would get no WhatsApp at all.
  if (input.phone) {
    await ensureContact({ email: user.email, userId, phone: input.phone, phoneSource: method }).catch(() => {});
  }
  const whatsappContact = await pool.query<{ id: number; name: string | null; email: string; phone: string | null }>(
    "SELECT id, name, email, phone FROM contacts WHERE user_id = $1 LIMIT 1",
    [userId],
  ).catch(() => ({ rows: [] as { id: number; name: string | null; email: string; phone: string | null }[] }));
  const whatsappPerson = whatsappContact.rows[0];
  const phoneForWhatsApp = input.phone || whatsappPerson?.phone || null;

  // Best-effort: email above is the reliable confirmation, so a WhatsApp
  // failure here is logged, not alerted on or allowed to fail the purchase.
  if (phoneForWhatsApp) {
    sendTransactionalWhatsApp({
      phone: phoneForWhatsApp,
      templateName: "purchase_confirmation",
      languageCode: "en",
      contactId: whatsappPerson?.id ?? null,
      variableValues: {
        "contact.first_name": firstNameOf(user.name) || "there",
        "contact.full_name": user.name || "there",
        "contact.email": user.email,
        "contact.phone": phoneForWhatsApp || "",
        "purchase.course_title": course.title,
        "purchase.access_link": `${SITE_URL}/account/courses/${encodeURIComponent(courseSlug)}`,
        "purchase.payment_id": paymentId,
        "purchase.amount": String(amount),
        "purchase.currency": currency,
        "purchase.method": method,
        "course.latest_title": course.title,
        "course.latest_access_link": `${SITE_URL}/account/courses/${encodeURIComponent(courseSlug)}`,
      },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: firstNameOf(user.name) || "there" },
            { type: "text", text: course.title },
            { type: "text", text: `${SITE_URL}/account/courses/${encodeURIComponent(courseSlug)}` },
          ],
        },
      ],
      description: `purchase confirmation for ${user.email}`,
      dedupeKey: `whatsapp_send_failed:purchase:${paymentId}`,
    }).catch(() => {});
  }

  if (claimId) {
    // Server-side Purchase for Meta, sent once per real payment (only the
    // request that won the claim gets here). The "You're in" page fires the
    // browser pixel with the same event id, so Meta counts it once.
    sendMetaEvent({
      eventName: "Purchase",
      eventId: `purchase-${claimId}`,
      eventSourceUrl: `${SITE_URL}/courses/${courseSlug}`,
      ip: input.client?.ip,
      userAgent: input.client?.userAgent,
      fbp: input.client?.fbp,
      fbc: input.client?.fbc,
      email: user.email,
      externalId: userId,
      customData: {
        value: amount,
        currency,
        order_id: String(claimId),
        content_ids: [courseSlug],
        content_name: course.title,
        content_type: "product",
      },
    }).catch(() => {});
    sendGa4Purchase({
      clientId: input.client?.gaClientId,
      sessionId: input.client?.gaSessionId,
      userId,
      transactionId: String(claimId),
      value: amount,
      currency,
      itemId: courseSlug,
      itemName: course.title,
    }).catch(() => {});
    emitWebhookEvent({
      eventType: "payment.succeeded",
      source: "payment_claims",
      sourceRecordId: claimId,
      contactEmail: user.email,
      contactName: user.name,
      userId,
      data: { course_id: course.id, course_title: course.title, method, amount, currency },
    }).catch(() => {});
  }
  emitWebhookEvent({
    eventType: wasFreeBefore ? "course.upgraded" : "course.enrolled",
    source: "course_enrollments",
    sourceRecordId: `${userId}:${course.id}`,
    contactEmail: user.email,
    contactName: user.name,
    userId,
    data: { course_id: course.id, course_title: course.title, course_slug: courseSlug, tier: "pro", method },
  }).catch(() => {});

  return "granted";
}
