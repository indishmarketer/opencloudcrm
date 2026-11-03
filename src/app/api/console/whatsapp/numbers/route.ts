import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { listWhatsAppPhoneNumbers } from "@/lib/whatsappTemplates";
import { SENDING_PURPOSES, setSendingNumber } from "@/lib/whatsappSender";

const Schema = z.object({
  /** null clears a purpose, putting it back on the default number. */
  phoneNumberId: z.string().trim().min(1).max(64).nullable(),
  purpose: z.enum(SENDING_PURPOSES).default("default"),
}).strict();

/** Chooses which of the account's numbers sends which kind of message.
 *
 * The id is checked against the numbers Meta actually reports on this
 * account rather than trusted from the request: a wrong one would silently
 * stop those messages going out, and the failure would look like a broken
 * integration rather than a wrong setting. */
export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a number." }, { status: 400 });
  const { phoneNumberId, purpose } = parsed.data;

  if (!phoneNumberId) {
    if (purpose === "default") {
      return NextResponse.json({ error: "Something has to send, so this one cannot be cleared." }, { status: 400 });
    }
    await setSendingNumber(purpose, null);
    return NextResponse.json({ ok: true });
  }

  let numbers;
  try {
    numbers = await listWhatsAppPhoneNumbers();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not reach WhatsApp." },
      { status: 409 },
    );
  }

  const chosen = numbers.find((number) => number.id === phoneNumberId);
  if (!chosen) return NextResponse.json({ error: "That number is not on this WhatsApp account." }, { status: 404 });
  if (chosen.status && chosen.status !== "CONNECTED") {
    return NextResponse.json(
      { error: `That number is ${chosen.status.toLowerCase()}, so it cannot send yet.` },
      { status: 409 },
    );
  }

  await setSendingNumber(purpose, chosen.id);
  return NextResponse.json({ ok: true, displayNumber: chosen.display_phone_number });
}
