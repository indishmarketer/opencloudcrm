import { raiseAlert } from "@/lib/systemAlerts";
import { hasOptedOut } from "@/lib/whatsappContacts";
import { normalizePhoneForWhatsApp, sendWhatsAppTemplateMessage } from "@/lib/whatsapp";
import { getWhatsAppVariableMappings, resolveWhatsAppVariableMappings } from "@/lib/whatsappVariableMappings";

/** Confirmations that follow something the customer just did: a purchase, a
 * booking. These were fire-and-forget, so a transient Meta error meant a
 * paying customer silently never got their message and the only trace was a
 * line in the server log.
 *
 * Retries a couple of times, then raises an alert that lands in Needs
 * attention with the number and template, so the owner can send it by hand.
 * Still never throws: the email confirmation is the reliable one, and
 * nothing here should be able to fail a payment or a booking. */
export async function sendTransactionalWhatsApp(input: {
  phone: string;
  templateName: string;
  languageCode: string;
  components?: unknown[];
  contactId?: number | null;
  /** The event's exact record values override the contact's latest activity. */
  variableValues?: Record<string, string>;
  /** Appears in the alert so the owner knows what failed to reach whom. */
  description: string;
  dedupeKey: string;
}): Promise<void> {
  const to = normalizePhoneForWhatsApp(input.phone);
  if (!to) return;

  // An explicit STOP applies to everything, service messages included.
  // Meta would refuse the send anyway and it would count against quality.
  if (await hasOptedOut(to).catch(() => false)) return;

  let components = input.components;
  try {
    const mappings = await getWhatsAppVariableMappings(input.templateName);
    if (mappings.length) {
      const variables = await resolveWhatsAppVariableMappings(input.templateName, input.contactId ?? null, input.variableValues || {});
      const body = { type: "body", parameters: variables.map((text) => ({ type: "text", text })) };
      const previous = Array.isArray(components) ? components as { type?: string }[] : [];
      components = [...previous.filter((component) => component.type !== "body"), body];
    }
  } catch (error) {
    await raiseAlert({
      kind: "whatsapp_send_failed",
      dedupeKey: input.dedupeKey,
      severity: "warning",
      title: `WhatsApp ${input.description} could not be delivered`,
      detail: `Could not fill the template variables: ${error instanceof Error ? error.message : String(error)}.`,
      link: "/console/whatsapp/messages",
    }).catch(() => {});
    return;
  }

  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await sendWhatsAppTemplateMessage(to, input.templateName, input.languageCode, components)
      .catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));
    if (result.ok) return;

    lastError = result.error;
    // A rejected template or a bad number fails the same way every time;
    // only a transient failure is worth another attempt.
    if (!isWorthRetrying(result.error)) break;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }

  await raiseAlert({
    kind: "whatsapp_send_failed",
    dedupeKey: input.dedupeKey,
    severity: "warning",
    title: `WhatsApp ${input.description} could not be delivered`,
    detail: `Template "${input.templateName}" to ${to} failed after retries: ${lastError}. The email went out as usual; send the WhatsApp by hand if it matters.`,
    link: "/console/whatsapp/messages",
  }).catch(() => {});
}

function isWorthRetrying(error: string): boolean {
  const transient = /timeout|timed out|rate limit|too many|temporarily|try again|5\d\d|network|fetch failed|ECONN/i;
  return transient.test(error);
}
