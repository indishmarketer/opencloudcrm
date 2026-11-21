import { pool } from "@/lib/db";
import { confirmContactSubscribed, ensureContact, recordContactActivity } from "@/lib/contacts";
import { normalizeCountry } from "@/lib/countries";
import { triggerEmailFlow, firstNameOf } from "@/lib/emailAutomation";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { sendEmail } from "@/lib/email";
import { getEmailTemplateOptional, applyTemplateVars } from "@/lib/emailTemplates";
import { escapeHtml } from "@/lib/escapeHtml";
import { getGuideDocumentById } from "@/lib/guideDocuments";
import { sendGuideDocumentEmail } from "@/lib/guideDelivery";

/** Everything that happens once a newsletter signup's email is verified,
 * shared by both the code-entry route and the magic-link route so neither
 * can drift out of sync with the other. */
export async function completeNewsletterVerification(email: string, payload?: Record<string, unknown> | null): Promise<void> {
  const subResult = await pool.query(
    "UPDATE newsletter_subscribers SET verified = true WHERE email = $1 RETURNING id, name",
    [email]
  );
  await saveFormCountry(email, subResult.rows[0]?.name ?? null, null, payload?.country);

  // Double opt-in just completed -- this is real, verifiable marketing
  // consent, so promote the contact record to reflect it. This is the only
  // place a contact is allowed to become 'subscribed'.
  await confirmContactSubscribed(email).catch((error) => console.error("Newsletter consent update failed:", error));

  triggerEmailFlow("newsletter_signup", email, { first_name: firstNameOf(subResult.rows[0]?.name) }).catch(
    () => {}
  );

  if (subResult.rows[0]) {
    emitWebhookEvent({
      eventType: "newsletter.subscribed",
      source: "newsletter_subscribers",
      sourceRecordId: subResult.rows[0].id,
      contactEmail: email,
      contactName: subResult.rows[0].name,
      data: { email, name: subResult.rows[0].name },
    }).catch(() => {});
  }
}

/** The country detected from the visitor's IP at subscribe time, carried
 * through the OTP payload so a magic link opened on another device still
 * records it. */
async function saveFormCountry(email: string, name: string | null, userId: number | null, raw: unknown): Promise<void> {
  const country = normalizeCountry(raw);
  if (!country) return;
  await ensureContact({ email, name, userId, country, countrySource: "ip" }).catch((err) =>
    console.error("saving form country failed (non-fatal):", err),
  );
}

export type ContactPayload = {
  name: string;
  message: string;
  updatesOptIn?: boolean;
  userId?: number | null;
  country?: string | null;
  attribution?: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_term?: string | null;
    utm_content?: string | null;
    referrer?: string | null;
    landing_page?: string | null;
  };
};

/** Everything that happens once a contact-form submission's email is
 * verified, shared by both the code-entry route and the magic-link route.
 * `payload` is whatever was captured at the moment the code/link was
 * requested (see the contact request-otp route), since a magic link
 * clicked from a different device has no access to the original page's
 * in-browser form state. */
export async function completeContactVerification(email: string, payload: ContactPayload): Promise<number> {
  const name = String(payload.name || "").slice(0, 200);
  const message = String(payload.message || "").slice(0, 5000);
  const attr = payload.attribution || {};

  // Only when the sender left the updates box ticked: asking for help is
  // not by itself consent to marketing.
  if (payload.updatesOptIn === true) await confirmContactSubscribed(email).catch((error) => console.error("Contact consent update failed:", error));

  const existingUser = payload.userId
    ? { rows: [{ id: payload.userId }] }
    : await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  const userId = existingUser.rows[0]?.id || null;

  const submission = await pool.query(
    "INSERT INTO contact_submissions (name, email, message, user_id) VALUES ($1, $2, $3, $4) RETURNING id",
    [name, email.slice(0, 200), message, userId]
  );
  const submissionId = submission.rows[0].id;
  await saveFormCountry(email, name, userId, payload.country);

  emitWebhookEvent({
    eventType: "contact_form.submitted",
    source: "contact_submissions",
    sourceRecordId: submissionId,
    contactEmail: email,
    contactName: name,
    userId,
    data: { name, email, message: message.slice(0, 2000) },
  }).catch(() => {});

  await pool.query(
    `INSERT INTO attribution_events
       (user_id, email, event_type, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, landing_page)
     VALUES ($1, $2, 'contact', $3, $4, $5, $6, $7, $8, $9)`,
    [userId, email, attr.utm_source, attr.utm_medium, attr.utm_campaign, attr.utm_term, attr.utm_content, attr.referrer, attr.landing_page]
  );

  const adminEmail = process.env.ADMIN_EMAIL;
  const tpl = adminEmail ? await getEmailTemplateOptional("contact-form-admin-notify") : null;
  if (adminEmail && tpl) {
    const vars = {
      name: escapeHtml(name),
      email: escapeHtml(email),
      message: escapeHtml(message).replace(/\n/g, "<br>"),
    };
    const result = await sendEmail({
      to: adminEmail,
      subject: applyTemplateVars(tpl.subject, vars),
      html: applyTemplateVars(tpl.body_html, vars),
      from: tpl.from_email,
      replyTo: email,
      templateKey: tpl.key,
      category: "fixed",
      trackOpens: tpl.track_opens,
    });
    if (!result.ok) {
      console.error(`Contact form admin notification failed to send for submission #${submissionId}`);
    }
  }

  const receivedTpl = await getEmailTemplateOptional("contact-form-received");
  if (receivedTpl) {
    const receivedVars = { first_name: escapeHtml(name.trim().split(/\s+/)[0] || "there") };
    const receivedResult = await sendEmail({
      to: email,
      subject: applyTemplateVars(receivedTpl.subject, receivedVars),
      html: applyTemplateVars(receivedTpl.body_html, receivedVars),
      from: receivedTpl.from_email,
      templateKey: receivedTpl.key,
      category: "fixed",
      trackOpens: receivedTpl.track_opens,
    });
    if (!receivedResult.ok) {
      console.error(`Contact form receipt email failed to send for submission #${submissionId}`);
    }
  }

  return submissionId;
}

export type GuidePayload = {
  guideId: number;
  name: string;
  phone?: string | null;
  country?: string | null;
  /** The guide_requests token this open came from. Only set on the newer
   * no-OTP path; legacy magic links in flight at deploy time have none. */
  token?: string | null;
};

/** Everything that happens once a free-guide request's email is proven
 * real. The guide no longer uses an OTP: the document is emailed straight
 * away and opening that tracked link is the proof, so this now runs from
 * the download route (see /api/guide/download). The older magic-link route
 * still calls it too, which keeps any link already sitting in an inbox at
 * deploy time working.
 *
 * Requesting a guide is itself the opt-in, there's no separate marketing
 * checkbox, so a real open is exactly the "fresh, provable consent"
 * confirmContactSubscribed requires. Someone who never opens never reaches
 * this function and is never subscribed.
 *
 * `sendDeliveryEmail` is false when the guide email has already gone out
 * and this is the open it produced, otherwise opening the link would mail
 * the same guide back to the reader every time.
 *
 * Returns the selected document's public URL, or null if it was deleted
 * between request and verification. */
export async function completeGuideVerification(
  email: string,
  payload: GuidePayload,
  options: { sendDeliveryEmail?: boolean } = {},
): Promise<{ downloadUrl: string; title: string } | null> {
  const guide = await getGuideDocumentById(payload.guideId);
  if (!guide) return null;

  const contactId = await ensureContact({ source: "guide", sourceDetail: "Free guide",
    email,
    name: String(payload.name || "").slice(0, 200) || null,
    phone: payload.phone ? String(payload.phone).slice(0, 30) : null,
    phoneSource: payload.phone ? "form" : undefined,
    country: normalizeCountry(payload.country),
    countrySource: normalizeCountry(payload.country) ? "form" : undefined,
  });
  // Only promotes the default/never-touched source -- a contact who
  // already came in as a manual entry or an import keeps that label, this
  // isn't a more specific origin than that.
  await pool.query("UPDATE contacts SET source = 'guide' WHERE id = $1 AND source = 'synced'", [contactId]);

  await confirmContactSubscribed(email);

  await recordContactActivity({
    email,
    activityType: "guide_downloaded",
    source: "lead_magnets",
    sourceRecordId: guide.id,
    metadata: { title: guide.title, fileName: guide.file_name, fileUrl: guide.file_url },
  });

  emitWebhookEvent({
    eventType: "lead_magnet.downloaded",
    source: "lead_magnets",
    sourceRecordId: guide.id,
    contactEmail: email,
    contactName: payload.name,
    data: { email, name: payload.name, guide: guide.title, guide_id: guide.id, guide_url: guide.file_url },
  }).catch(() => {});

  if (options.sendDeliveryEmail !== false && payload.token) {
    await sendGuideDocumentEmail({ email, name: payload.name, token: payload.token }).catch((error) =>
      console.error("Guide delivery email failed:", error),
    );
  }

  return { downloadUrl: guide.file_url, title: guide.title };
}
