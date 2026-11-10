import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { verifyTurnstile } from "@/lib/turnstile";
import { checkRateLimit } from "@/lib/rateLimit";
import { raiseInboxAlert } from "@/lib/systemAlerts";
import { getFormById, recordFormSubmission } from "@/lib/forms";
import { ensureContact } from "@/lib/contacts";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/escapeHtml";
import { emitWebhookEvent } from "@/lib/webhookEvents";

/** A Form element's submission. Two shapes, both validated below:
 *
 * - Legacy "custom" mode (no formId): fields are whatever the admin typed
 *   into that one page-builder block instance, nothing persisted beyond an
 *   inbox alert -- see CustomFormBlock.tsx's own doc comment. Kept working
 *   unchanged for pages that already have one of these.
 * - Saved form (formId set): fields are validated against that form's own
 *   stored field list, the submission is persisted to form_submissions,
 *   and it can trigger an automation via custom_form.submitted. */
const Schema = z
  .object({
    formId: z.number().int().positive().optional(),
    pageUrl: z.string().trim().max(500).optional().default(""),
    formHeading: z.string().trim().max(200).optional().default(""),
    fields: z
      .record(z.string().max(100), z.string().max(5000))
      .refine((obj) => Object.keys(obj).length > 0 && Object.keys(obj).length <= 20, "Invalid field count."),
    turnstileToken: z.string().min(1).max(4096),
  })
  .strict();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`form-submit:${ip}`, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { formId, pageUrl, formHeading, fields, turnstileToken } = parsed.data;

  const humanVerified = await verifyTurnstile(turnstileToken, ip === "unknown" ? undefined : ip);
  if (!humanVerified) {
    return NextResponse.json({ error: "Could not verify you're human." }, { status: 400 });
  }

  if (formId) {
    const form = await getFormById(formId);
    if (!form) return NextResponse.json({ error: "This form no longer exists." }, { status: 404 });

    for (const f of form.fields) {
      if (f.required && !String(fields[f.key] || "").trim()) {
        return NextResponse.json({ error: `${f.label || "A required field"} is required.` }, { status: 400 });
      }
    }

    // Best-effort contact match: the first email-type field with a value,
    // same spirit as the contact/newsletter forms linking submissions to a
    // real CRM contact -- unlike the legacy ad hoc path, which deliberately
    // never does this (see CustomFormBlock.tsx's doc comment).
    const emailField = form.fields.find((f) => f.type === "email" && String(fields[f.key] || "").trim());
    const nameField = form.fields.find((f) => f.type === "text" && String(fields[f.key] || "").trim());
    const email = emailField ? String(fields[emailField.key]).trim() : "";
    const contactId = email ? await ensureContact({ email, name: nameField ? String(fields[nameField.key]).trim() : null }).catch(() => null) : null;

    const submissionId = await recordFormSubmission({ formId, fieldValues: fields, pageUrl, contactId });

    const detail = form.fields.map((f) => `${f.label}: ${fields[f.key] || ""}`).join("\n")
      + (pageUrl ? `\n\nSubmitted from: ${pageUrl}` : "");

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

  // Legacy ad hoc path -- unchanged.
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
