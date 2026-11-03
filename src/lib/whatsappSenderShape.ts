/** The pure half of whatsappSender.ts: which kinds of message can be routed
 * to a number, and what to call them.
 *
 * Split out because whatsappSender.ts imports the database pool, and every
 * export of a module a client component imports becomes a client reference
 * -- the Numbers picker is a client component and only needs these names. */

export const SENDING_PURPOSES = ["default", "marketing", "utility", "authentication"] as const;
export type SendingPurpose = (typeof SENDING_PURPOSES)[number];

export const PURPOSE_LABELS: Record<SendingPurpose, string> = {
  default: "Everything",
  marketing: "Marketing",
  utility: "Utility",
  authentication: "Authentication",
};
