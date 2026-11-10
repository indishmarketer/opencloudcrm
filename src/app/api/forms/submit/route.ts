import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { verifyTurnstile } from "@/lib/turnstile";
import { checkRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { raiseInboxAlert } from "@/lib/systemAlerts";
import { getFormById, recordFormSubmission } from "@/lib/forms";
import { ensureContact } from "@/lib/contacts";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/escapeHtml";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { requestOtp, verifyOtp } from "@/lib/otp";
import { getAttributionFromRequest } from "@/lib/attribution";

/** A Form element's submission.  Three modes, all validated below:
 *
 * - step:"request-otp" (verifyEmail forms only): validates fields, sends an
 *   OTP to the email field, stashes the payload in the OTP record. No
 *   submission recorded yet.
 * - step:"verify-otp" (verifyEmail forms only): verifies the code, then
 *   records the submission from the stashed payload.
 * - (default) direct submit (non-OTP saved forms): validates against the
 *   form's own field list, records the submission immediately.
 * - Legacy "custom" mode (no formId): ad-hoc fields with no DB persistence.
 *   Kept working unchanged for pages that already have one of these. */

const BaseSchema = z.object({
  formId: z.number().int().positive().optional(),
  pageUrl: z.string().trim().max(500).optional().default(""),
  formHeading: z.string().trim().max(200).optional().default(""),
  fields: z
    .record(z.string().max(100), z.string().max(5000))
    .refine((obj) => Object.keys(obj).length <= 20, "Invalid field count.")
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
  const { formId, pageUrl, formHeading, fields, turnstileToken, step, otpEmail, otpCode } = parsed.data;

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
    }).catch(() => null);
    const submissionId = await recordFormSubmission({
      formId,
      fieldValues: payload.fields,
      pageUrl: payload.pageUrl || pageUrl,
      contactId,
    });

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

    // Validate required fields (skip hidden ones -- they never have UI)
    for (const f of form.fields) {
      if (f.required && !f.hidden && !String(fields[f.key] || "").trim()) {
        return NextResponse.json({ error: `${f.label || "A required field"} is required.` }, { status: 400 });
      }
    }

    // ── OTP request step ────────────────────────────────────────────────────
    if (step === "request-otp" || form.verifyEmail) {
      const emailField = form.fields.find((f) => f.type === "email" && !f.hidden);
      const emailValue = emailField ? String(fields[emailField.key] || "").trim() : "";
      if (!emailValue) {
        return NextResponse.json({ error: "An email field is required for verification." }, { status: 400 });
      }

      if (!(await checkRateLimit(`form-otp-email:${privateRateLimitKey(emailValue)}`, 3, 60 * 60 * 1000))) {
        return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
      }

      const attribution = getAttributionFromRequest(req);
      const purpose = `form-submit-${formId}`;
      const sent = await requestOtp(emailValue, purpose, { fields, pageUrl, attribution });
      if (!sent) {
        return NextResponse.json({ error: "We couldn't send the verification email. Please try again." }, { status: 502 });
      }
      return NextResponse.json({ ok: true });
    }

    // ── Standard (non-OTP) submit ───────────────────────────────────────────
    const emailField = form.fields.find((f) => f.type === "email" && String(fields[f.key] || "").trim());
    const nameField = form.fields.find(
      (f) => (/name/i.test(f.key) || /name/i.test(f.label) || f.type === "text") && String(fields[f.key] || "").trim()
    );
    const phoneField = form.fields.find(
      (f) => (f.type === "phone" || /phone/i.test(f.key)) && String(fields[f.key] || "").trim()
    );
    const countryField = form.fields.find(
      (f) => (f.type === "country" || /country/i.test(f.key)) && String(fields[f.key] || "").trim()
    );
    const email = emailField ? String(fields[emailField.key]).trim() : "";
    const contactName = nameField ? String(fields[nameField.key]).trim() : null;
    const contactPhone = phoneField ? String(fields[phoneField.key]).trim() : null;
    const contactCountry = countryField ? String(fields[countryField.key]).trim() : null;

    const contactId = email
      ? await ensureContact({
          email,
          name: contactName,
          phone: contactPhone,
          phoneSource: contactPhone ? "form" : undefined,
          country: contactCountry,
          countrySource: contactCountry ? "form" : undefined,
        }).catch(() => null)
      : null;

    const submissionId = await recordFormSubmission({ formId, fieldValues: fields, pageUrl, contactId });

    const detail =
      form.fields.map((f) => `${f.label}: ${fields[f.key] || ""}`).join("\n") +
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
      data: { formId, formName: form.name, fields },
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  }

  // ── Legacy ad-hoc path (no formId) -- unchanged ───────────────────────────
  if (!turnstileToken) return NextResponse.json({ error: "Missing verification token." }, { status: 400 });
  const humanVerified = await verifyTurnstile(turnstileToken, ip === "unknown" ? undefined : ip);
  if (!humanVerified) {
    return NextResponse.json({ error: "Could not verify you're human." }, { status: 400 });
  }

  const detail =
    Object.entries(fields)
      .map(([label, value]) => `${label}: ${value}`)
      .join("\n") + (pageUrl ? `\n\nSubmitted from: ${pageUrl}` : "");

  await raiseInboxAlert({
    kind: "custom_form_submission",
    dedupeKey: `custom_form_submission:${randomUUID()}`,
    title: `New form submission${formHeading ? `: ${formHeading}` : ""}`,
    detail,
    severity: "info",
    notifyEmail: true,
  });

  return NextResponse.json({ ok: true });
}
