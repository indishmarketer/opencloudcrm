import { escapeHtml } from "@/lib/escapeHtml";

export type MessageVariable = { token: string; label: string; group?: string };
export type SystemValueSource = { label: string; value: string; group: string };

/** Recipient fields available in broadcasts and individual contact messages. */
export const CONTACT_MESSAGE_VARIABLES: MessageVariable[] = [
  { token: "first_name", label: "First name" },
  { token: "last_name", label: "Last name" },
  { token: "name", label: "Full name" },
  { token: "email", label: "Email address" },
  { token: "phone", label: "Phone number" },
  { token: "country", label: "Country" },
  { token: "address", label: "Address" },
  { token: "source", label: "Contact source" },
];

const RECIPIENT_FIELDS: MessageVariable[] = CONTACT_MESSAGE_VARIABLES;
const COURSE_FIELDS: MessageVariable[] = [
  { token: "course_title", label: "Course title" },
  { token: "course_url", label: "Course link" },
];

/** One token identity and label across composers and workflow actions.
 * Event fields resolve when the sending workflow has that event payload. */
export const EMAIL_ATTRIBUTES: MessageVariable[] = [
  ...RECIPIENT_FIELDS.map((item) => ({ ...item, group: "Contact" })),
  { token: "contact.id", label: "Contact ID", group: "Contact" },
  { token: "event_type", label: "Event type", group: "Event" },
  ...COURSE_FIELDS.map((item) => ({ ...item, group: "Courses" })),
  ...[
    ["course_id", "Course ID"], ["course_title", "Course title"], ["course_url", "Course access link"],
    ["course_slug", "Course slug"], ["tier", "Course tier"], ["completed_lessons", "Completed lessons"],
    ["total_lessons", "Total lessons"], ["current_module", "Current module"], ["current_lesson", "Next lesson"],
  ].map(([token, label]) => ({ token: `data.${token}`, label, group: "Courses" })),
  ...[
    ["tool_id", "Tool ID"], ["tool_name", "Tool name"], ["website_url", "Tool website"],
    ["tool_url", "Published tool link"], ["edit_url", "Edit submission link"],
    ["manage_url", "Manage tools link"], ["payment_url", "Listing payment link"],
    ["pricing_type", "Tool pricing"], ["status", "Review status"], ["note", "Review note"],
  ].map(([token, label]) => ({ token: `data.${token}`, label, group: "Tools" })),
  ...[
    ["amount", "Payment amount"], ["currency", "Payment currency"], ["method", "Payment method"],
    ["payment_id", "Payment ID"], ["order_id", "Order ID"], ["failure_code", "Payment failure code"],
  ].map(([token, label]) => ({ token: `data.${token}`, label, group: "Payments" })),
  ...[
    ["scheduled_start", "Meeting start time"], ["timezone", "Meeting timezone"],
    ["join_link", "Meeting link"], ["booking_page", "Booking page"], ["meeting_name", "Meeting name"],
  ].map(([token, label]) => ({ token: `data.${token}`, label, group: "Meetings" })),
  ...[
    ["guide", "Guide slug"], ["guide_url", "Guide link"], ["application_id", "Application ID"],
    ["topics", "Application topics"], ["message", "Contact message"],
    ["sample_url", "Writing sample link"], ["submission_url", "Author submission link"],
    ["form_id", "Form ID"], ["form_name", "Form name"],
    ["submission_id", "Form submission ID"], ["page_url", "Form page URL"],
  ].map(([token, label]) => ({ token: `data.${token}`, label, group: "Content & forms" })),
  ...[
    ["code", "Verification code"], ["verification_url", "Verification link"],
    ["magic_link_url", "Magic link"], ["expires_minutes", "Code expiry (minutes)"],
    ["verify_url", "Account verification link"], ["reset_url", "Password reset link"],
    ["confirm_url", "Email change confirmation link"], ["current_email", "Previous email address"],
    ["login_url", "Login link"], ["signin_url", "Sign-in link"], ["link", "Console login link"],
    ["invited_by", "Invited by"], ["source", "Verification source"],
  ].map(([token, label]) => ({ token: `data.${token}`, label, group: "Account" })),
];

export const TEMPLATE_VARIABLES: MessageVariable[] = EMAIL_ATTRIBUTES;

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
};

export function contactMessageValues(contact: {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  address?: string | null;
  source?: string | null;
}): Record<string, string> {
  const name = (contact.name || "").trim();
  return {
    first_name: contact.first_name?.trim() || name.split(/\s+/)[0] || "there",
    last_name: contact.last_name?.trim() || "",
    name: name || "there",
    email: contact.email || "",
    phone: contact.phone || "",
    country: contact.country || "",
    address: contact.address || "",
    source: contact.source || "",
  };
}

/** HTML-safe named variable interpolation for email content. */
export function applyMessageVariables(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => escapeHtml(values[key] ?? ""));
}

/** Subject lines are plain text, not HTML: escaping would show "O&#39;Brien"
 * in the inbox. Line breaks are dropped so a value can't split the header. */
export function applySubjectVariables(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => (values[key] ?? "").replace(/[\r\n]+/g, " "));
}

/** Campaigns have a contact but no particular course or workflow event. */
export function unsupportedCampaignVariables(...parts: string[]): string[] {
  const supported = new Set(CONTACT_MESSAGE_VARIABLES.map((item) => item.token));
  const found = new Set<string>();
  for (const part of parts) {
    for (const match of part.matchAll(/\{\{([a-zA-Z0-9_.]+)\}\}/g)) {
      if (!supported.has(match[1])) found.add(match[1]);
    }
  }
  return [...found];
}
