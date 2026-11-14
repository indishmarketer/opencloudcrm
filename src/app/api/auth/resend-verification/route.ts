import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { safeRedirectPath } from "@/lib/auth";
import { requestOtp } from "@/lib/otp";
import { checkRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { z } from "zod";

const ResendSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  redirect: z.string().max(1000).optional(),
}).strict();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`resend-verification:${ip}`, 5, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = ResendSchema.safeParse(await req.json().catch(() => null));
  // Always return the same generic response whether or not the email
  // exists/needs verification, so this endpoint can't be used to enumerate
  // registered accounts.
  const genericResponse = () => NextResponse.json({ ok: true });
  if (!parsed.success) return genericResponse();
  const { email, redirect } = parsed.data;
  if (!(await checkRateLimit(`resend-email:${privateRateLimitKey(email)}`, 3, 60 * 60 * 1000))) {
    return genericResponse();
  }

  const result = await pool.query(
    "SELECT id, email, name FROM users WHERE email = $1 AND email_verified_at IS NULL",
    [email]
  );
  const user = result.rows[0];
  if (!user) return genericResponse();

  await requestOtp(user.email, "account", {
    userId: user.id, name: user.name, redirect: safeRedirectPath(redirect),
  }).catch((error) => console.error("Resend verification failed:", error));

  return genericResponse();
}
