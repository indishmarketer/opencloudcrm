import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { checkRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { z } from "zod";
import { ensureContact } from "@/lib/contacts";
import { normalizeCountry } from "@/lib/countries";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(200),
  turnstileToken: z.string().min(1).max(4096),
  // AuthForm shares its payload shape with signup. These known, bounded
  // navigation/profile fields are ignored during login but must be accepted
  // so both the current client and already-open browser tabs remain compatible.
  name: z.string().trim().max(200).optional(),
  interested_in: z.string().trim().max(500).optional(),
  redirect: z.string().max(1000).optional(),
  ref: z.string().trim().max(100).optional(),
  country: z.string().trim().max(2).optional(),
}).strict();
import { verifyTurnstile } from "@/lib/turnstile";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`login:${ip}`, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = LoginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid login details." }, { status: 400 });
  const { email, password, turnstileToken } = parsed.data;
  if (!(await checkRateLimit(`login-account:${privateRateLimitKey(email)}`, 20, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const humanVerified = await verifyTurnstile(turnstileToken, ip === "unknown" ? undefined : ip);
  if (!humanVerified) {
    return NextResponse.json({ error: "Could not verify you're human. Try again." }, { status: 400 });
  }

  const result = await pool.query(
    "SELECT id, email, password_hash, email_verified_at FROM users WHERE email = $1",
    [email]
  );
  const user = result.rows[0];
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  if (!user.email_verified_at) {
    return NextResponse.json(
      { error: "Please confirm your email first — check your inbox for the link we sent.", needsVerification: true },
      { status: 403 }
    );
  }

  await createSession({ userId: user.id, email: user.email });
  // Accounts made before country was asked get Cloudflare's guess; it never
  // replaces a country the person or the owner picked.
  const ipCountry = normalizeCountry(req.headers.get("cf-ipcountry"));
  if (ipCountry) {
    await ensureContact({ email: user.email, userId: user.id, country: ipCountry, countrySource: "ip" })
      .catch((err) => console.error("login country fill failed (non-fatal):", err));
  }
  return NextResponse.json({ ok: true });
}
