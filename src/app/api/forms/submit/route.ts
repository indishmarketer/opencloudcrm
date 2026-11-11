import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyTurnstile } from "@/lib/turnstile";
import { checkRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { getFormById } from "@/lib/forms";
import { requestOtp, verifyOtp } from "@/lib/otp";
import { getAttributionFromRequest } from "@/lib/attribution";
import { completeFormSubmission, extractContactData, formSubmitPurpose } from "@/lib/formSubmission";
import type { FormDefinition } from "@/lib/formsShape";

/** A saved form's submission. Three modes, all validated below:
 *
 * - step:"request-otp" (email-verification forms): validates fields, sends an
 *   OTP to the email field, stashes the payload in the OTP record. No
 *   submission recorded yet.
 * - step:"verify-otp": verifies the code, then records the submission from
 *   the stashed payload. The magic link in the same email does the same thing
 *   via /api/verify-link -- both end up in completeFormSubmission().
 * - (default) direct submit: validates against the form's own field list and
 *   records the submission immediately.
 *
 * Turnstile is required for the first request of either flow (the initial
 * submit, or the OTP request), never for the verify step -- the token was
 * already spent there, and possession of a code mailed to a real inbox is a
 * stronger human signal than a challenge anyway. */

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
    if (field.type === "number" && value && !Number.isFinite(Number(value))) return { values, error: `${field.label || "This field"} must be a number.` };
    if (field.type === "date" && value && Number.isNaN(Date.parse(value))) return { values, error: `${field.label || "This field"} must be a date.` };
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

  const form = await getFormById(formId);
  if (!form) return NextResponse.json({ error: "This form no longer exists." }, { status: 404 });
  if (form.isFixed) return NextResponse.json({ error: "This form is reserved for account access." }, { status: 400 });

  // ── OTP verify step ──────────────────────────────────────────────────────
  if (step === "verify-otp") {
    if (!otpEmail || !otpCode) {
      return NextResponse.json({ error: "Invalid verification request." }, { status: 400 });
    }
    if (!(await checkRateLimit(`form-otp:${ip}`, 10, 10 * 60 * 1000))) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }
    const result = await verifyOtp(otpEmail, otpCode, formSubmitPurpose(formId));
    if (!result) {
      return NextResponse.json({ error: "Incorrect or expired code." }, { status: 400 });
    }
    const payload = result.payload as
      | { fields: Record<string, string>; pageUrl: string; attribution?: Record<string, string | null>; ipCountry?: string | null }
      | null;
    if (!payload) {
      return NextResponse.json({ error: "Verification expired. Please start over." }, { status: 400 });
    }

    // Re-validated rather than trusted: the stashed payload was validated
    // against the form as it stood when the code was requested, and the form
    // may have changed in the ten minutes since.
    const verified = validatedValues(form, payload.fields);
    if (verified.error) return NextResponse.json({ error: verified.error }, { status: 400 });

    await completeFormSubmission({
      form,
      values: verified.values,
      pageUrl: payload.pageUrl || pageUrl,
      verifiedEmail: otpEmail,
      attribution: payload.attribution,
      ipCountry: payload.ipCountry,
    });
    return NextResponse.json({ ok: true });
  }

  // ── First request of either flow: Turnstile, then validate ───────────────
  if (!turnstileToken) return NextResponse.json({ error: "Missing verification token." }, { status: 400 });
  const humanVerified = await verifyTurnstile(turnstileToken, ip === "unknown" ? undefined : ip);
  if (!humanVerified) {
    return NextResponse.json({ error: "Could not verify you're human." }, { status: 400 });
  }

  const checked = validatedValues(form, fields);
  if (checked.error) return NextResponse.json({ error: checked.error }, { status: 400 });
  const values = checked.values;
  const ipCountry = req.headers.get("cf-ipcountry");

  // ── OTP request step ─────────────────────────────────────────────────────
  // Driven only by the form's own verifyEmail setting, which the owner is now
  // free to turn off on every form including the seeded Contact and
  // Newsletter ones. (It used to be forced on for those two, so they could
  // not be used as plain forms.)
  if (form.verifyEmail) {
    // The address to verify is the mapped contact email when there is one,
    // but falls back to any visible email field: an owner is free to set an
    // email field's contact mapping to "none" (keep it out of the CRM) and
    // still want the submission verified.
    const emailField = form.fields.find((f) => f.type === "email" && !f.hidden);
    const emailValue =
      extractContactData(form.fields, values).email ||
      (emailField ? String(values[emailField.key] || "").trim() : "");
    if (!emailValue) {
      return NextResponse.json({ error: "An email field is required for verification." }, { status: 400 });
    }

    if (!(await checkRateLimit(`form-otp-email:${privateRateLimitKey(emailValue)}`, 5, 60 * 60 * 1000))) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const attribution = getAttributionFromRequest(req);
    const sent = await requestOtp(emailValue, formSubmitPurpose(formId), {
      formId,
      fields: values,
      pageUrl,
      attribution,
      ipCountry,
    });
    if (!sent) {
      return NextResponse.json({ error: "We couldn't send the verification email. Please try again." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, step: "verify-otp", email: emailValue });
  }

  // ── Standard (non-OTP) submit ────────────────────────────────────────────
  await completeFormSubmission({
    form,
    values,
    pageUrl,
    attribution: getAttributionFromRequest(req),
    ipCountry,
  });
  return NextResponse.json({ ok: true });
}
