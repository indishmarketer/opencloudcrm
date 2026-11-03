import { pool } from "@/lib/db";
import { confirmContactSubscribed, ensureContact, recordContactActivity } from "@/lib/contacts";
import { normalizeCountry } from "@/lib/countries";
import { triggerEmailFlow, firstNameOf } from "@/lib/emailAutomation";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { sendEmail } from "@/lib/email";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { escapeHtml } from "@/lib/escapeHtml";
import { getLeadMagnetById } from "@/lib/leadMagnets";

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
  confirmContactSubscribed(email).catch(() => {});

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
  if (payload.updatesOptIn === true) confirmContactSubscribed(email).catch(() => {});

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
  if (adminEmail) {
    const tpl = await getEmailTemplate("contact-form-admin-notify");
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

  const receivedTpl = await getEmailTemplate("contact-form-received");
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

  return submissionId;
}

export type GuidePayload = {
  guideId: number;
  name: string;
  phone?: string | null;
};

/** Everything that happens once a free-guide request's email is verified
 * (clicking the magic link or entering the code), shared by the code-entry
 * route and the magic-link route. Requesting a guide is itself the opt-in
 * -- there's no separate marketing checkbox -- so a verified click is
 * exactly the "fresh, provable consent" confirmContactSubscribed requires;
 * someone who never clicks never gets this far and is never subscribed.
 * Returns the guide's slug so the caller can send them to its download
 * page, or null if the guide was deleted between request and click. */
export async function completeGuideVerification(email: string, payload: GuidePayload): Promise<string | null> {
  const guide = await getLeadMagnetById(payload.guideId);
  if (!guide) return null;

  const contactId = await ensureContact({
    email,
    name: String(payload.name || "").slice(0, 200) || null,
    phone: payload.phone ? String(payload.phone).slice(0, 30) : null,
    phoneSource: payload.phone ? "form" : undefined,
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
    metadata: { slug: guide.slug, title: guide.title },
  });

  emitWebhookEvent({
    eventType: "lead_magnet.downloaded",
    source: "lead_magnets",
    sourceRecordId: guide.id,
    contactEmail: email,
    contactName: payload.name,
    data: { email, name: payload.name, guide: guide.slug },
  }).catch(() => {});

  return guide.slug;
}
