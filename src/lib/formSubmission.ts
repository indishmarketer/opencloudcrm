import { pool } from "@/lib/db";
import { ensureContact, recordContactActivity } from "@/lib/contacts";
import { normalizeCountry } from "@/lib/countries";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/escapeHtml";
import { raiseInboxAlert } from "@/lib/systemAlerts";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { completeContactVerification, completeNewsletterVerification } from "@/lib/otpCompletion";
import {
  extractContactData,
  type FormDefinition,
  type FormContactDetail,
  type SubmittedValues,
} from "@/lib/formsShape";

/** Everything that happens once a saved form's submission is final, in one
 * place. Three routes reach it and they must not drift apart:
 *
 *  - POST /api/forms/submit, direct submit (no email verification)
 *  - POST /api/forms/submit, step:"verify-otp" (the 6-digit code)
 *  - POST /api/verify-link (the magic link in the same OTP email, which may
 *    be clicked on a completely different device)
 *
 * Before this existed only the first two did any of it, so the magic link in
 * a form's own verification email landed on /verify?error=1 -- the link was
 * sent, looked legitimate, and could never work. */

/** Re-exported from formsShape so the routes have one import for the whole
 * submission path. They live there, not here, because they are pure and
 * therefore testable without pulling in the database -- and because a
 * Next.js route file may only export route handlers, so the OTP purpose
 * helper could not live in the submit route that issues it. */
export {
  extractContactData,
  formSubmitPurpose,
  FORM_SUBMIT_PURPOSE_PREFIX,
  type FormContactData,
  type FormContactDetail,
  type SubmittedValues,
} from "@/lib/formsShape";

/** Writes the "Extra contact detail" answers onto the contact. One row per
 * contact per key, so re-submitting a form updates the detail in place
 * rather than stacking up near-duplicates -- the full history of every
 * answer is already in form_submissions. */
async function saveContactDetails(
  contactId: number,
  details: FormContactDetail[],
  formId: number,
  submissionId: number,
): Promise<void> {
  for (const detail of details) {
    await pool.query(
      `INSERT INTO contact_form_details (contact_id, field_key, label, value, form_id, submission_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (contact_id, field_key) DO UPDATE SET
         label = EXCLUDED.label, value = EXCLUDED.value,
         form_id = EXCLUDED.form_id, submission_id = EXCLUDED.submission_id,
         updated_at = now()`,
      [contactId, detail.key, detail.label, detail.value, formId, submissionId],
    );
  }
}

export async function listContactFormDetails(contactId: number): Promise<
  { id: number; field_key: string; label: string; value: string; form_name: string | null; updated_at: Date }[]
> {
  const result = await pool.query(
    `SELECT d.id, d.field_key, d.label, d.value, f.name AS form_name, d.updated_at
     FROM contact_form_details d LEFT JOIN forms f ON f.id = d.form_id
     WHERE d.contact_id = $1 ORDER BY d.updated_at DESC`,
    [contactId],
  );
  return result.rows;
}

export async function deleteContactFormDetail(contactId: number, detailId: number): Promise<boolean> {
  const result = await pool.query("DELETE FROM contact_form_details WHERE id = $1 AND contact_id = $2", [
    detailId,
    contactId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

function submissionDetailText(form: FormDefinition, values: SubmittedValues, pageUrl: string): string {
  const lines = form.fields.map((f) => `${f.label || f.key}: ${values[f.key] ?? ""}`).join("\n");
  return lines + (pageUrl ? `\n\nSubmitted from: ${pageUrl}` : "");
}

/** Records the submission and fans out every downstream effect. Safe to call
 * exactly once per final submission; the inbox alert and the webhook event
 * are both keyed on the new submission id, so a retry of the same HTTP
 * request cannot double-notify. */
export async function completeFormSubmission(input: {
  form: FormDefinition;
  values: SubmittedValues;
  pageUrl: string;
  /** The verified address, when a verification step established one. Takes
   * precedence over whatever the email field happens to hold. */
  verifiedEmail?: string | null;
  attribution?: Record<string, string | null>;
  /** Country detected from the visitor's IP, used only when no country field
   * on the form supplied one. */
  ipCountry?: string | null;
}): Promise<{ submissionId: number; contactId: number | null }> {
  const { form, values, pageUrl } = input;
  const contactData = extractContactData(form.fields, values);
  const email = (input.verifiedEmail || contactData.email || "").trim().toLowerCase();
  const country = normalizeCountry(contactData.country) || normalizeCountry(input.ipCountry);

  const contactId = email
    ? await ensureContact({
        email,
        name: contactData.name,
        firstName: contactData.firstName,
        lastName: contactData.lastName,
        address: contactData.address,
        phone: contactData.phone,
        phoneSource: contactData.phone ? "form" : undefined,
        country,
        countrySource: country ? (contactData.country ? "form" : "ip") : undefined,
      })
    : null;

  const submission = await pool.query<{ id: number }>(
    `INSERT INTO form_submissions (form_id, field_values, page_url, contact_id)
     VALUES ($1, $2::jsonb, $3, $4) RETURNING id`,
    [form.id, JSON.stringify(values), pageUrl, contactId],
  );
  const submissionId = submission.rows[0].id;

  if (contactId && contactData.details.length > 0) {
    await saveContactDetails(contactId, contactData.details, form.id, submissionId).catch((err) =>
      console.error("saving form contact details failed (non-fatal):", err),
    );
  }

  if (contactId && email) {
    await recordContactActivity({
      email,
      activityType: "form_submitted",
      source: "form_submissions",
      sourceRecordId: submissionId,
      metadata: {
        formId: form.id,
        formName: form.name,
        label: form.source || form.name,
        pageUrl,
      },
    }).catch((err) => console.error("recording form activity failed (non-fatal):", err));
  }

  // The two built-in behaviours a form can still carry. They are no longer a
  // reason the form can't be deleted -- while it exists, it keeps doing this.
  if (form.systemRole === "contact" && email) {
    const messageField = form.fields.find((f) => f.key === "message" || f.type === "textarea");
    await completeContactVerification(email, {
      name: contactData.name || "",
      message: messageField ? String(values[messageField.key] || "") : "",
      attribution: input.attribution,
      country,
    }).catch((err) => console.error("contact-form completion failed (non-fatal):", err));
  }
  if (form.systemRole === "newsletter" && email) {
    await pool.query(
      `INSERT INTO newsletter_subscribers (email, name, source, verified)
       VALUES ($1, $2, $3, false)
       ON CONFLICT (email) DO UPDATE SET name = COALESCE(EXCLUDED.name, newsletter_subscribers.name)`,
      [email, contactData.name, form.source || form.name],
    );
    await completeNewsletterVerification(email, { country }).catch((err) =>
      console.error("newsletter completion failed (non-fatal):", err),
    );
  }

  const detail = submissionDetailText(form, values, pageUrl);
  await raiseInboxAlert({
    kind: "custom_form_submission",
    dedupeKey: `custom_form_submission:${submissionId}`,
    title: `New submission: ${form.name}`,
    detail,
    severity: "info",
    link: `/console/forms/${form.id}/submissions`,
    notifyEmail: !form.notifyEmail,
  }).catch((err) => console.error("form inbox alert failed (non-fatal):", err));

  if (form.notifyEmail) {
    await sendEmail({
      to: form.notifyEmail,
      subject: `New submission: ${form.name}`,
      html: `<p>New submission for <strong>${escapeHtml(form.name)}</strong>:</p><pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(detail)}</pre>`,
      critical: true,
      category: "system",
    }).catch(() => {});
  }

  await emitWebhookEvent({
    eventType: "custom_form.submitted",
    source: "form_submissions",
    sourceRecordId: submissionId,
    contactEmail: email || null,
    contactName: contactData.name,
    data: {
      // snake_case `form_id` is what the workflow queue function filters on
      // (see migration 181); `formId` stays for webhook receivers built
      // against the original payload.
      form_id: form.id,
      formId: form.id,
      form_name: form.name,
      formName: form.name,
      form_slug: form.slug || null,
      submission_id: submissionId,
      page_url: pageUrl,
      fields: values,
    },
  }).catch(() => {});

  return { submissionId, contactId };
}
