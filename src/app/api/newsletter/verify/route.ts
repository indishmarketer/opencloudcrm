import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { verifyOtp } from "@/lib/otp";
import { completeNewsletterVerification } from "@/lib/otpCompletion";
import { z } from "zod";

const VerifySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  code: z.string().regex(/^\d{6}$/),
}).strict();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`newsletter-verify:${ip}`, 8, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = VerifySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid verification request." }, { status: 400 });
  const { email, code } = parsed.data;
  if (!(await checkRateLimit(`newsletter-verify-email:${privateRateLimitKey(email)}`, 8, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const result = await verifyOtp(email, code, "newsletter");
  if (!result) {
    return NextResponse.json({ error: "Incorrect or expired code." }, { status: 400 });
  }

  await completeNewsletterVerification(email, result.payload);

  return NextResponse.json({ ok: true });
}
