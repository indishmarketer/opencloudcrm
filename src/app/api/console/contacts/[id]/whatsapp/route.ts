import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { recordContactActivity } from "@/lib/contacts";
import { setWhatsAppStatus } from "@/lib/whatsappContacts";

/** Owner turns WhatsApp marketing on or off for one contact.
 *
 * Separate from the email equivalent (../marketing) on purpose: the two
 * channels are separate consents, and someone who wants order updates by
 * email and nothing on their phone is a normal thing to want. Turning it
 * on records the owner as the source, which is how an opt-in that nobody
 * ticked a box for stays distinguishable later. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const contactId = Number(id);
  if (!Number.isInteger(contactId)) return NextResponse.json({ error: "Invalid contact id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  if (typeof body.subscribed !== "boolean") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const subscribed: boolean = body.subscribed;

  const contact = await pool.query<{ email: string; phone: string | null }>(
    "SELECT email, phone FROM contacts WHERE id = $1",
    [contactId],
  );
  const row = contact.rows[0];
  if (!row) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  if (subscribed && !row.phone) {
    return NextResponse.json({ error: "Add a phone number for this contact first." }, { status: 409 });
  }

  await setWhatsAppStatus(contactId, subscribed ? "subscribed" : "unsubscribed", "owner");
  await recordContactActivity({
    email: row.email,
    activityType: subscribed ? "whatsapp_turned_on" : "whatsapp_turned_off",
    source: "console",
    sourceRecordId: `${contactId}:${Date.now()}`,
    metadata: { by: "admin" },
  }).catch(() => {});

  return NextResponse.json({ ok: true, status: subscribed ? "subscribed" : "unsubscribed" });
}
