import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { consumeRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { generatePhoneCode, startPhoneVerification } from "@/lib/accountContact";
import { sendWhatsAppTemplateMessage, normalizePhoneForWhatsApp } from "@/lib/whatsapp";
import { getAccountPhoneOtpTemplate } from "@/lib/whatsappTemplates";

const Schema = z.object({ phone: z.string().trim().regex(/^\d{4,15}$/) }).strict();

/**
 * Sends a one-time code over WhatsApp to a number somebody wants to put on
 * their account. Nothing is saved to the account here; `/verify` does that
 * once the code comes back, which is what proves the number is theirs and
 * that it can actually receive WhatsApp.
 *
 * **The template must exist and be approved by Meta before this works.**
 * Business-initiated WhatsApp messages can only be templates, and an
 * authentication template has to be approved by Meta. The selected template
 * and its language are read from the WhatsApp console, so there is no second
 * copy of that configuration in Coolify.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Log in first." }, { status: 401 });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  const phone = normalizePhoneForWhatsApp(parsed.data.phone);

  // Per account and per destination number: the second stops this being
  // used to send repeated messages to somebody else's phone.
  if (!(await consumeRateLimit(`account-phone-start:${session.userId}`, 5, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many codes requested. Try again later." }, { status: 429 });
  }
  if (!(await consumeRateLimit(`account-phone-target:${privateRateLimitKey(phone)}`, 5, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many codes sent to that number. Try again later." }, { status: 429 });
  }

  const otpTemplate = await getAccountPhoneOtpTemplate().catch(() => null);
  if (!otpTemplate) {
    return NextResponse.json(
      {
        error:
          "No approved phone verification template is selected. In the WhatsApp console, add one approved Authentication template with a Copy code button to the Account phone verification group.",
      },
      { status: 409 },
    );
  }

  const code = generatePhoneCode();
  await startPhoneVerification(session.userId, parsed.data.phone, code);

  // Meta's authentication templates take the code as the body variable and
  // repeat it on the copy button, which is why it appears twice.
  const sent = await sendWhatsAppTemplateMessage(
    phone,
    otpTemplate.name,
    otpTemplate.language,
    [
      { type: "body", parameters: [{ type: "text", text: code }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
    ],
    // No fromPhoneNumberId: sendWhatsAppTemplateMessage resolves the
    // template category itself and picks the number that carries one-time
    // codes rather than the marketing one, which is the behaviour we want.
  );

  if (!sent.ok) {
    return NextResponse.json(
      { error: "We could not send the code to that number. Check it and try again." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
