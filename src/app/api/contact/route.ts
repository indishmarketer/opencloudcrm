import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { verifyOtp } from "@/lib/otp";
import { completeContactVerification, type ContactPayload } from "@/lib/otpCompletion";
import { z } from "zod";

const VerifySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  code: z.string().regex(/^\d{6}$/),
}).strict();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`contact:${ip}`, 5, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many messages. Try again later." }, { status: 429 });
  }

  const parsed = VerifySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid verification request." }, { status: 400 });
  const { email, code } = parsed.data;

  const result = await verifyOtp(email, code, "contact");
  if (!result) {
    return NextResponse.json({ error: "Incorrect or expired code." }, { status: 400 });
  }
  if (!result.payload) {
    // Shouldn't happen -- request-otp always stores a payload for this
    // purpose -- but fail clearly rather than submitting a blank message.
    return NextResponse.json({ error: "This verification has expired. Please start over." }, { status: 400 });
  }

  await completeContactVerification(email, result.payload as unknown as ContactPayload);

  return NextResponse.json({ ok: true });
}
