import { escapeHtml } from "@/lib/escapeHtml";

export type MessageVariable = { token: string; label: string };
export type SystemValueSource = { label: string; value: string; group: string };

/** Recipient fields available in broadcasts and individual contact messages. */
export const CONTACT_MESSAGE_VARIABLES: MessageVariable[] = [
  { token: "first_name", label: "First name" },
  { token: "name", label: "Full name" },
  { token: "email", label: "Email address" },
  { token: "phone", label: "Phone number" },
];

const RECIPIENT_FIELDS: MessageVariable[] = [
  { token: "first_name", label: "First name" },
  { token: "name", label: "Full name" },
  { token: "email", label: "Email address" },
  { token: "phone", label: "Phone number" },
];
const COURSE_FIELDS: MessageVariable[] = [
  { token: "course_title", label: "Course title" },
  { token: "course_url", label: "Course link" },
];

/** For reusable content templates (src/app/console/(protected)/email/library):
 * these are reused in campaigns, automation steps with any trigger, and
 * one-off contact emails, so the token list is the broadest common set
 * rather than one trigger's exact fields. course_title/course_url only
 * resolve where a course is actually in context. */
export const TEMPLATE_VARIABLES: MessageVariable[] = [...RECIPIENT_FIELDS, ...COURSE_FIELDS];

/** Event values already supplied to each email automation trigger. */
export const EMAIL_FLOW_VARIABLES: Record<string, MessageVariable[]> = {
  user_signup_verified: RECIPIENT_FIELDS,
  newsletter_signup: RECIPIENT_FIELDS,
  course_enroll_free: [...RECIPIENT_FIELDS, ...COURSE_FIELDS],
  course_purchase: [
    ...RECIPIENT_FIELDS,
    ...COURSE_FIELDS,
    { token: "payment_amount", label: "Payment amount" },
    { token: "payment_currency", label: "Payment currency" },
    { token: "payment_method", label: "Payment method" },
    { token: "payment_reference", label: "Payment reference" },
  ],
  course_upgrade_to_pro: [
    ...RECIPIENT_FIELDS,
    ...COURSE_FIELDS,
    { token: "payment_amount", label: "Payment amount" },
    { token: "payment_currency", label: "Payment currency" },
    { token: "payment_method", label: "Payment method" },
    { token: "payment_reference", label: "Payment reference" },
  ],
  course_completed: [...RECIPIENT_FIELDS, ...COURSE_FIELDS],
  course_inactivity: [
    ...RECIPIENT_FIELDS,
    ...COURSE_FIELDS,
    { token: "completed_lessons", label: "Completed lessons" },
    { token: "total_lessons", label: "Total lessons" },
    { token: "current_module", label: "Next module" },
    { token: "current_lesson", label: "Next lesson" },
  ],
  community_inactivity: [...RECIPIENT_FIELDS, { token: "community_url", label: "Community link" }],
  voice_agent_interest: [
    ...RECIPIENT_FIELDS,
    { token: "company", label: "Company name" },
    { token: "voice_agent_url", label: "Voice agent link" },
  ],
};

export function contactMessageValues(contact: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}): Record<string, string> {
  const name = (contact.name || "").trim();
  return {
    first_name: name.split(/\s+/)[0] || "there",
    name: name || "there",
    email: contact.email || "",
    phone: contact.phone || "",
  };
}

/** HTML-safe named variable interpolation for email content. */
export function applyMessageVariables(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => escapeHtml(values[key] ?? ""));
}
