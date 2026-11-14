import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSameOriginPost } from "@/lib/auth";
import { checkRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { verifyOtp } from "@/lib/otp";
import { completeAccountVerification } from "@/lib/accountVerification";

const Schema = z.object({
  email: z.email().max(320),
  code: z.string().regex(/^\d{6}$/),
}).strict();

export async function POST(req: NextRequest) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`account-verify:${ip}`, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the six digit code." }, { status: 400 });
  const { email, code } = parsed.data;
  if (!(await checkRateLimit(`account-verify-email:${privateRateLimitKey(email)}`, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const result = await verifyOtp(email.toLowerCase(), code, "account");
  const userId = Number(result?.payload?.userId);
  if (!result || !Number.isInteger(userId) || userId < 1) {
    return NextResponse.json({ error: "Code invalid or expired. Request a new code." }, { status: 400 });
  }
  const redirect = await completeAccountVerification(req, userId, result.email, String(result.payload?.redirect || ""));
  return NextResponse.json({ ok: true, redirect });
}
