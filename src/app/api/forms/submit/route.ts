import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { verifyTurnstile } from "@/lib/turnstile";
import { checkRateLimit } from "@/lib/rateLimit";
import { raiseInboxAlert } from "@/lib/systemAlerts";

/** A custom Form element's submission -- a Form in "custom" mode, whose
 * fields are whatever the owner defined in the console, not the fixed
 * name/email/message of a contact form. Deliberately simpler than
 * /api/contact/request-otp: no OTP/email-confirmation step (that exists
 * specifically for lead-capture spam resistance -- a generic form, e.g.
 * a survey, doesn't need it) and no Contact record created -- the
 * submission goes straight to the owner as an inbox alert (raiseInboxAlert,
 * the same mechanism "a tool submitted"/"a review was written" already
 * use), which already has its own console page and email digest with no
 * new table needed. */
const Schema = z
  .object({
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
  const { pageUrl, formHeading, fields, turnstileToken } = parsed.data;

  const humanVerified = await verifyTurnstile(turnstileToken, ip);
  if (!humanVerified) {
    return NextResponse.json({ error: "Could not verify you're human." }, { status: 400 });
  }

  const detail =
    Object.entries(fields)
      .map(([label, value]) => `${label}: ${value}`)
      .join("\n") + (pageUrl ? `\n\nSubmitted from: ${pageUrl}` : "");

  // raiseInboxAlert's own consumers (the console list, the email digest)
  // escape title/detail at render time -- pre-escaping here would double-
  // escape it there.
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
