import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";
import { verifyPasswordResetToken } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

const ResetSchema = z.object({
  token: z.string().min(1).max(4096),
  password: z.string().min(8).max(200),
}).strict();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`reset-password:${ip}`, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = ResetSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A reset link and a password between 8 and 200 characters are required." },
      { status: 400 }
    );
  }
  const { token, password } = parsed.data;

  const claim = await verifyPasswordResetToken(token);
  if (!claim) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired." },
      { status: 400 }
    );
  }

  // Re-check the account still exists rather than trusting the token's
  // email/userId blindly -- it could have been issued 30 minutes ago.
  const existing = await pool.query("SELECT id FROM users WHERE id = $1 AND email = $2", [
    claim.userId,
    claim.email,
  ]);
  if (existing.rows.length === 0) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired." },
      { status: 400 }
    );
  }

  // Using a link sent to the inbox proves the person owns that address, so
  // this also counts as email verification.
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    `UPDATE users SET password_hash = $1, session_version = session_version + 1,
       email_verified_at = COALESCE(email_verified_at, now())
     WHERE id = $2`,
    [passwordHash, claim.userId]
  );

  return NextResponse.json({ ok: true });
}
