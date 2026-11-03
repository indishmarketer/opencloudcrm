import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession, clearSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { deleteOwnAccount } from "@/lib/accountDeletion";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkRateLimit(`account-delete:${session.userId}`, 5, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const { password } = await req.json().catch(() => ({}));
  if (!password || typeof password !== "string") {
    return NextResponse.json({ error: "Enter your password to confirm." }, { status: 400 });
  }

  const result = await pool.query("SELECT password_hash FROM users WHERE id = $1", [session.userId]);
  const user = result.rows[0];
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return NextResponse.json({ error: "Incorrect password." }, { status: 401 });

  await deleteOwnAccount(session.userId);
  await clearSession();

  return NextResponse.json({ ok: true });
}
