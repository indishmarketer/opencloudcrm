import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { ensureContact } from "@/lib/contacts";
import { normalizeCountry } from "@/lib/countries";
import { consumeRateLimit } from "@/lib/rateLimit";

const Schema = z.object({ country: z.string().trim().length(2) }).strict();

/** The signed-in person sets their own country (account settings or the
 * checkout's "change" link). Checkout uses it to pick the currency and
 * payment method, so it wins over the IP guess and earlier form answers. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  if (!(await consumeRateLimit(`account-country:${session.userId}`, 20, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many changes. Try again later." }, { status: 429 });
  }
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  const country = parsed.success ? normalizeCountry(parsed.data.country) : null;
  if (!country) return NextResponse.json({ error: "Choose a country from the list." }, { status: 400 });

  await ensureContact({ email: session.email, userId: session.userId, country, countrySource: "self" });
  return NextResponse.json({ ok: true, country });
}
