import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { confirmEmailChange } from "@/lib/accountContact";
import { consumeRateLimit, privateRateLimitKey } from "@/lib/rateLimit";

const Schema = z.object({ token: z.string().min(20).max(200) }).strict();

export async function POST(req: NextRequest) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That confirmation link is invalid." }, { status: 400 });
  if (!(await consumeRateLimit(`account-email-confirm:${privateRateLimitKey(parsed.data.token)}`, 5, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const result = await confirmEmailChange(parsed.data.token);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
  return NextResponse.json({ ok: true, email: result.email });
}
