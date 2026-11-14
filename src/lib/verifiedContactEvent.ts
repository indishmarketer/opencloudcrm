import { ensureContact } from "@/lib/contacts";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import type { VERIFIED_CONTACT_SOURCES } from "@/lib/workflowGraph";

export type VerifiedContactSource = (typeof VERIFIED_CONTACT_SOURCES)[number]["value"];

/** One event per contact, emitted only after a real email or provider verification. */
export async function emitVerifiedContactEvent(input: {
  email: string;
  name?: string | null;
  userId?: number | null;
  source: VerifiedContactSource;
}): Promise<void> {
  const contactId = await ensureContact({ email: input.email, name: input.name, userId: input.userId });
  await emitWebhookEvent({
    eventType: "contact.verified",
    source: "contacts",
    sourceRecordId: contactId,
    contactEmail: input.email,
    contactName: input.name,
    userId: input.userId,
    data: { source: input.source, email: input.email, name: input.name || null },
  });
}
