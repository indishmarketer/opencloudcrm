import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rateLimit";
import { confirmPhoneVerification } from "@/lib/accountContact";

const Schema = z.object({ code: z.string().trim().regex(/^\d{4,8}$/) }).strict();

/**
 * Checks the code and, only then, saves the number.
 *
 * The number comes from the stored verification row, never from the
 * request body. Taking it from the request would let somebody verify one
 * number and save a different one, which defeats the point.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Log in first." }, { status: 401 });

  if (!(await consumeRateLimit(`account-phone-verify:${session.userId}`, 20, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the code we sent you." }, { status: 400 });

  const result = await confirmPhoneVerification(session.userId, session.email, parsed.data.code);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });

  return NextResponse.json({ ok: true, phone: result.phone });
}
