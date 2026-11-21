import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getGuideDocumentById } from "@/lib/guideDocuments";
import { createGuideRequest } from "@/lib/guideRequests";
import { sendGuideDocumentEmail } from "@/lib/guideDelivery";
import { ensureContact } from "@/lib/contacts";
import { detectEmailTypo } from "@/lib/emailValidation";
import { validatePhoneNumber } from "@/lib/phoneValidation";
import { normalizeCountry } from "@/lib/countries";

const RequestSchema = z.object({
  guideId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(320),
  phone: z.string().trim().max(30).optional(),
  country: z.string().trim().length(2).optional(),
  turnstileToken: z.string().min(1).max(4096),
}).strict();

/** Requesting the free guide.
 *
 * There is no OTP step and no instant in-popup download. Everyone gets the
 * same thing: the guide is emailed straight away with a tracked download
 * link, and the popup tells them to go and open it. Opening that link is
 * what proves the address is real, and only then is the contact promoted to
 * a subscribed lead (see /api/guide/download).
 *
 * Asking for a code first cost us people at the exact moment they were most
 * interested, and it proved the same thing the download click already
 * proves. The click carries no friction and arrives whenever they actually
 * read their mail, so the link deliberately never expires. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`guide-request:${ip}`, 5, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check those details." }, { status: 400 });
  const { guideId, name, phone, turnstileToken } = parsed.data;

  // Auto-correct common email typos
  const typo = detectEmailTypo(parsed.data.email);
  const email = typo.hasTypo && typo.suggestedEmail ? typo.suggestedEmail : parsed.data.email;

  // Validate phone if supplied
  const detectedCountry = normalizeCountry(req.headers.get("cf-ipcountry"));
  const selectedCountry = normalizeCountry(parsed.data.country) || detectedCountry;
  if (phone) {
    const phoneVal = validatePhoneNumber(selectedCountry, phone, true);
    if (!phoneVal.isValid && phoneVal.error) {
      return NextResponse.json({ error: phoneVal.error }, { status: 400 });
    }
  }

  if (!(await checkRateLimit(`guide-request-email:${privateRateLimitKey(email)}`, 5, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const humanVerified = await verifyTurnstile(turnstileToken, ip === "unknown" ? undefined : ip);
  if (!humanVerified) {
    return NextResponse.json({ error: "Could not verify you're human. Try again." }, { status: 400 });
  }

  const guide = await getGuideDocumentById(guideId);
  if (!guide || !guide.is_active) {
    return NextResponse.json({ error: "That guide isn't available right now." }, { status: 404 });
  }

  // Record what they told us now, while we have it. Sending the email below
  // creates a contacts row by itself (sendEmail -> ensureContact) with no
  // name on it, so without this anyone who never opens the guide would sit
  // in the list permanently nameless. They stay unsubscribed until the open.
  await ensureContact({ source: "guide", sourceDetail: "Free guide",
    email, name, phone: phone || null, phoneSource: phone ? "form" : undefined,
    country: selectedCountry, countrySource: selectedCountry ? "form" : undefined,
  }).catch((err) => console.error("guide request ensureContact failed (non-fatal):", err));

  const token = await createGuideRequest({
    guideId: guide.id,
    email,
    name,
    phone: phone || null,
    country: selectedCountry,
  });

  const sent = await sendGuideDocumentEmail({ email, name, token });
  if (!sent.ok) {
    return NextResponse.json(
      { error: "We couldn't email your guide. Please check the address and try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, email });
}
