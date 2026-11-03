import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { listWhatsAppPhoneNumbers, registerWhatsAppPhoneNumber } from "@/lib/whatsappTemplates";

/** Step 4, the last one: finishes Cloud API registration so the number can
 * actually send and receive. `pin` becomes the number's two-step
 * verification PIN if it never had one, or has to match its existing PIN
 * if it does -- Meta rejects a mismatch rather than resetting it. */
const Schema = z.object({
  pin: z.string().trim().regex(/^\d{6}$/, "The PIN has to be exactly 6 digits."),
}).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Set a 6-digit PIN." }, { status: 400 });

  try {
    const numbers = await listWhatsAppPhoneNumbers();
    if (!numbers.some((number) => number.id === id)) {
      return NextResponse.json({ error: "That number is not on this WhatsApp account." }, { status: 404 });
    }
    await registerWhatsAppPhoneNumber(id, parsed.data.pin);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not register that number." }, { status: 409 });
  }
}
