import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyTurnstile } from "@/lib/turnstile";
import { checkRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { raiseInboxAlert } from "@/lib/systemAlerts";
import { getFormById, recordFormSubmission } from "@/lib/forms";
import { ensureContact, recordContactActivity } from "@/lib/contacts";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/escapeHtml";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { requestOtp, verifyOtp } from "@/lib/otp";
import { getAttributionFromRequest } from "@/lib/attribution";
import type { FormDefinition } from "@/lib/formsShape";
import { pool } from "@/lib/db";
import { completeContactVerification, completeNewsletterVerification } from "@/lib/otpCompletion";

/** A Form element's submission.  Three modes, all validated below:
 *
 * - step:"request-otp" (verifyEmail forms only): validates fields, sends an
 *   OTP to the email field, stashes the payload in the OTP record. No
 *   submission recorded yet.
 * - step:"verify-otp" (verifyEmail forms only): verifies the code, then
 *   records the submission from the stashed payload.
 * - (default) direct submit (non-OTP saved forms): validates against the
 *   form's own field list, records the submission immediately.
 */

function validatedValues(form: FormDefinition, submitted: Record<string, string>): { values: Record<string, string>; error?: string } {
  const choicesOf = (raw: string): string[] => {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).map((value) => value.trim()).filter(Boolean);
    } catch { /* Plain-text option list. */ }
    return raw.split(raw.includes("\n") ? "\n" : ",").map((value) => value.trim()).filter(Boolean);
  };
  const values: Record<string, string> = {};
  for (const field of form.fields) {
    const value = field.hidden ? field.defaultValue : (submitted[field.key] || "").trim();
    if (field.required && !field.hidden && !value) return { values, error: `${field.label || "A required field"} is required.` };
    if (field.type === "email" && value && !z.email().safeParse(value).success) return { values, error: `Enter a valid ${field.label || "email"}.` };
    if (["select", "radio", "multiselect"].includes(field.type) && value && field.options) {
      const options = choicesOf(field.options);
      const selected = field.type === "multiselect" ? value.split(",").map((option) => option.trim()) : [value];
      if (selected.some((option) => !options.includes(option))) return { values, error: `Invalid ${field.label || "choice"}.` };
    }
    values[field.key] = value;
  }
  return { values };
}

const BaseSchema = z.object({
  formId: z.number().int().positive(),
  pageUrl: z.string().trim().max(500).optional().default(""),
  fields: z
    .record(z.string().max(100), z.string().max(5000))
    .refine((obj) => Object.keys(obj).length <= 30, "Invalid field count.")
    .optional()
    .default({}),
  turnstileToken: z.string().max(4096).optional().default(""),
  step: z.enum(["request-otp", "verify-otp"]).optional(),
  otpEmail: z.string().email().max(320).optional(),
  otpCode: z.string().regex(/^\d{6}$/).optional(),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`form-submit:${ip}`, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = BaseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { formId, pageUrl, fields, turnstileToken, step, otpEmail, otpCode } = parsed.data;

  // ── OTP verify step (no Turnstile needed -- the token was already checked in
  //    request-otp; a separate verify is rate-limited below instead) ──────────
  if (step === "verify-otp") {
    if (!formId || !otpEmail || !otpCode) {
      return NextResponse.json({ error: "Invalid verification request." }, { status: 400 });
    }
    if (!(await checkRateLimit(`form-otp:${ip}`, 10, 10 * 60 * 1000))) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }
    const purpose = `form-submit-${formId}`;
    const result = await verifyOtp(otpEmail, otpCode, purpose);
    if (!result) {
      return NextResponse.json({ error: "Incorrect or expired code." }, { status: 400 });
    }
    const payload = result.payload as { fields: Record<string, string>; pageUrl: string } | null;
    if (!payload) {
      return NextResponse.json({ error: "Verification expired. Please start over." }, { status: 400 });
    }

    const form = await getFormById(formId);
    if (!form) return NextResponse.json({ error: "This form no longer exists." }, { status: 404 });
    if (form.isFixed) return NextResponse.json({ error: "This form is reserved for account access." }, { status: 400 });
    const verified = validatedValues(form, payload.fields);
    if (verified.error) return NextResponse.json({ error: verified.error }, { status: 400 });
    payload.fields = verified.values;

    const nameField = form.fields.find(
      (f) => (/name/i.test(f.key) || /name/i.test(f.label) || f.type === "text") && String(payload.fields[f.key] || "").trim()
    );
    const phoneField = form.fields.find(
      (f) => (f.type === "phone" || /phone/i.test(f.key)) && String(payload.fields[f.key] || "").trim()
    );
    const countryField = form.fields.find(
      (f) => (f.type === "country" || /country/i.test(f.key)) && String(payload.fields[f.key] || "").trim()
    );
    const contactName = nameField ? String(payload.fields[nameField.key]).trim() : null;
    const contactPhone = phoneField ? String(payload.fields[phoneField.key]).trim() : null;
    const contactCountry = countryField ? String(payload.fields[countryField.key]).trim() : null;

    const contactId = await ensureContact({
      email: otpEmail,
      name: contactName,
      phone: contactPhone,
      phoneSource: contactPhone ? "form" : undefined,
      country: contactCountry,
      countrySource: contactCountry ? "form" : undefined,
    });
    const submissionId = await recordFormSubmission({
      formId,
      fieldValues: payload.fields,
      pageUrl: payload.pageUrl || pageUrl,
      contactId,
    });
    if (contactId) await recordContactActivity({
      email: otpEmail, activityType: "form_submitted", source: "form_submissions",
      sourceRecordId: submissionId, metadata: { formId, formName: form.name, label: form.source || form.name, pageUrl: payload.pageUrl || pageUrl },
    });
    if (form.systemRole === "contact") {
      const messageField = form.fields.find((field) => field.key === "message" || field.type === "textarea");
      await completeContactVerification(otpEmail, {
        name: contactName || "", message: messageField ? String(payload.fields[messageField.key] || "") : "",
        attribution: (result.payload as { attribution?: Record<string, string | null> } | null)?.attribution,
      });
    }
    if (form.systemRole === "newsletter") {
      await pool.query(
        `INSERT INTO newsletter_subscribers (email, name, source, verified)
         VALUES ($1, $2, $3, false)
         ON CONFLICT (email) DO UPDATE SET name = COALESCE(EXCLUDED.name, newsletter_subscribers.name)`,
        [otpEmail, contactName, form.source || form.name],
      );
      await completeNewsletterVerification(otpEmail);
    }

    const detail =
      form.fields.map((f) => `${f.label}: ${payload.fields[f.key] || ""}`).join("\n") +
      (payload.pageUrl ? `\n\nSubmitted from: ${payload.pageUrl}` : "");

    await raiseInboxAlert({
      kind: "custom_form_submission",
      dedupeKey: `custom_form_submission:${submissionId}`,
      title: `New submission: ${form.name}`,
      detail,
      severity: "info",
      link: `/console/forms/${formId}`,
      notifyEmail: !form.notifyEmail,
    });
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
      contactEmail: otpEmail,
      data: { formId, formName: form.name, fields: payload.fields },
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  }

  // ── Saved-form flow (with or without OTP request step) ───────────────────
  if (formId) {
    // Turnstile verification required for the initial submit / OTP request
    if (!turnstileToken) return NextResponse.json({ error: "Missing verification token." }, { status: 400 });
    const humanVerified = await verifyTurnstile(turnstileToken, ip === "unknown" ? undefined : ip);
    if (!humanVerified) {
      return NextResponse.json({ error: "Could not verify you're human." }, { status: 400 });
    }

    const form = await getFormById(formId);
    if (!form) return NextResponse.json({ error: "This form no longer exists." }, { status: 404 });
    if (form.isFixed) return NextResponse.json({ error: "This form is reserved for account access." }, { status: 400 });
    const checked = validatedValues(form, fields);
    if (checked.error) return NextResponse.json({ error: checked.error }, { status: 400 });
    const values = checked.values;

    // ── OTP request step ────────────────────────────────────────────────────
    if (step === "request-otp" || form.verifyEmail || form.systemRole) {
      const emailField = form.fields.find((f) => f.type === "email" && !f.hidden);
      const emailValue = emailField ? String(values[emailField.key] || "").trim() : "";
      if (!emailValue) {
        return NextResponse.json({ error: "An email field is required for verification." }, { status: 400 });
      }

      if (!(await checkRateLimit(`form-otp-email:${privateRateLimitKey(emailValue)}`, 3, 60 * 60 * 1000))) {
        return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
      }

      const attribution = getAttributionFromRequest(req);
      const purpose = `form-submit-${formId}`;
      const sent = await requestOtp(emailValue, purpose, { fields: values, pageUrl, attribution });
      if (!sent) {
        return NextResponse.json({ error: "We couldn't send the verification email. Please try again." }, { status: 502 });
      }
      return NextResponse.json({ ok: true });
    }

    // ── Standard (non-OTP) submit ───────────────────────────────────────────
    const emailField = form.fields.find((f) => f.type === "email" && String(values[f.key] || "").trim());
    const nameField = form.fields.find(
      (f) => (/name/i.test(f.key) || /name/i.test(f.label) || f.type === "text") && String(values[f.key] || "").trim()
    );
    const phoneField = form.fields.find(
      (f) => (f.type === "phone" || /phone/i.test(f.key)) && String(values[f.key] || "").trim()
    );
    const countryField = form.fields.find(
      (f) => (f.type === "country" || /country/i.test(f.key)) && String(values[f.key] || "").trim()
    );
    const email = emailField ? String(values[emailField.key]).trim() : "";
    const contactName = nameField ? String(values[nameField.key]).trim() : null;
    const contactPhone = phoneField ? String(values[phoneField.key]).trim() : null;
    const contactCountry = countryField ? String(values[countryField.key]).trim() : null;

    const contactId = email
      ? await ensureContact({
          email,
          name: contactName,
          phone: contactPhone,
          phoneSource: contactPhone ? "form" : undefined,
          country: contactCountry,
          countrySource: contactCountry ? "form" : undefined,
        })
      : null;

    const submissionId = await recordFormSubmission({ formId, fieldValues: values, pageUrl, contactId });
    if (contactId) await recordContactActivity({
      email, activityType: "form_submitted", source: "form_submissions",
      sourceRecordId: submissionId, metadata: { formId, formName: form.name, label: form.source || form.name, pageUrl },
    });

    const detail =
      form.fields.map((f) => `${f.label}: ${values[f.key] || ""}`).join("\n") +
      (pageUrl ? `\n\nSubmitted from: ${pageUrl}` : "");

    await raiseInboxAlert({
      kind: "custom_form_submission",
      dedupeKey: `custom_form_submission:${submissionId}`,
      title: `New submission: ${form.name}`,
      detail,
      severity: "info",
      link: `/console/forms/${formId}`,
      notifyEmail: !form.notifyEmail,
    });
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
      data: { formId, formName: form.name, fields: values },
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Choose a form before submitting." }, { status: 400 });
}
