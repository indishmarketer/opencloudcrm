/** The full set of outbound webhook event types this site can emit. Every
 * entry here corresponds to a real, already-existing action -- there is no
 * event for something the app doesn't actually do. To add a new event in the
 * future: add it here, then call emitWebhookEvent() from src/lib/webhookEvents.ts
 * at the real call site that observes the action (see that file's own doc
 * comment for the full pattern). */
export const WEBHOOK_EVENT_TYPES = [
  { key: "contact.verified", label: "New contact verified", description: "A contact proves ownership of their email address. Narrow this trigger by signup or form source." },
  { key: "contact.created", label: "New contact identified", description: "A brand-new person entered the CRM (signup, newsletter, contact form, voice lead, etc.) for the first time. It fires from the contacts table itself, so it cannot tell you which form they came from -- to start a workflow from one specific form, use 'Custom form submitted' and pick that form." },
  { key: "account.verification_requested", label: "Account created (legacy verification event)", description: "Retained for older workflows. New verification requests use the private Email verification requested trigger, with an email fallback until that workflow is activated." },
  { key: "user.verified", label: "New signup (email verified)", description: "Someone finishes signing up by verifying their email, and their account becomes active." },
  { key: "account.email_change_requested", label: "Account email change requested", description: "Someone asked to change their account's email address. Payload: data.confirm_url (sent to the NEW address), data.current_email (their existing address, for context in the email body)." },
  { key: "console_admin.login_link_requested", label: "Console login link requested (legacy)", description: "Console login links are sent directly as security emails. This event is retained only for older workflow compatibility." },
  { key: "console_admin.invited", label: "Console admin invited", description: "An existing admin invited a new console admin. The access grant itself already happened (the DB row exists) regardless of whether this email sends. Payload: data.invited_by, data.login_url." },
  { key: "newsletter.subscribed", label: "Newsletter subscribed", description: "Someone confirms a newsletter signup via the OTP code." },
  { key: "newsletter.unsubscribed", label: "Email unsubscribed", description: "Someone unsubscribes from marketing email." },
  { key: "email.bounced", label: "Email bounced", description: "An email provider reports a bounce; includes whether it is permanent, temporary, or undetermined." },
  { key: "email.complained", label: "Email spam complaint", description: "An email recipient reports a message as spam; the address is suppressed immediately." },
  { key: "course.enrolled", label: "Course enrolled", description: "Someone gets access to a course for the first time (free enroll or a fresh PRO purchase)." },
  { key: "course.upgraded", label: "Course upgraded to PRO", description: "An existing free learner upgrades to PRO on a course." },
  { key: "course.revoked", label: "Course access revoked", description: "An admin removes someone's enrollment from a course." },
  { key: "course.completed", label: "Course completed", description: "Someone finishes every lesson they have access to in a course." },
  { key: "course.inactivity", label: "Course inactivity detected", description: "A course learner's last-activity timestamp and course progress; add a wait and send a reminder from one shared workflow." },
  { key: "payment.succeeded", label: "Payment succeeded", description: "A Razorpay or PayPal payment is captured and access is granted." },
  { key: "payment.failed", label: "Payment failed", description: "Razorpay reports a failed course payment; use a condition and recovery message to follow up." },
  { key: "payment_claim.submitted", label: "Manual payment claim submitted", description: "Someone submits a manual payment reference for review." },
  { key: "payment_claim.resolved", label: "Manual payment claim resolved", description: "An admin approves or rejects a manual payment claim." },
  { key: "contact_form.submitted", label: "Contact form submitted", description: "Someone submits the public contact form." },
  { key: "external_webhook.received", label: "External webhook received", description: "A signed inbound webhook reaches this deployment; use the source slug and payload fields in conditions and actions." },
  { key: "meeting.booked", label: "Meeting booked", description: "A visitor books a meeting and receives a confirmed time." },
  { key: "author_application.submitted", label: "Author application submitted", description: "Someone applies to write for the blog." },
  { key: "author_application.reviewed", label: "Author application reviewed", description: "An admin approves, rejects, or requests changes on an author application; the status field in the payload tells you which." },
  { key: "author_application.draft_submitted", label: "Author draft submitted", description: "An approved applicant submits (or resubmits) their draft link." },
  { key: "author_application.accepted", label: "Author draft accepted", description: "An admin accepts an applicant's draft, ready to publish." },
  { key: "directory_tool.submitted", label: "Tool submitted", description: "An account holder submits a tool. data.listing_tier is \"free\" or \"paid\" (paid listings pay after submitting; see Tool payment received). Branch on it with a Condition." },
  { key: "directory_tool.reviewed", label: "Tool reviewed", description: "A tool is published, approved pending payment, sent back for changes, or declined. Add a condition on data.status to send only for the result you choose." },
  { key: "directory_tool.published", label: "Tool published", description: "A tool goes live in the directory: you approved it, or an approved paid listing was paid for. Carries the tool name, website and live link. (Submitted, review and payment emails are built in; see Tools directory > Communication.)" },
  { key: "directory_tool.paid", label: "Tool payment received", description: "A paid listing's fee was charged. data.status is \"published\" if it was already approved, otherwise \"pending\" (still awaiting review)." },
  { key: "review.submitted", label: "Review submitted", description: "Someone submits a testimonial/review." },
  { key: "lead_magnet.downloaded", label: "Free guide downloaded", description: "Someone verifies their email after requesting a free guide and reaches its download page." },
  { key: "custom_form.submitted", label: "Custom form submitted", description: "Someone submits a form built in Console -> Forms. Can be narrowed to one specific form, or left on any form; the payload carries form_id, form_name and every submitted field for use in conditions and actions." },
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]["key"];

const VALID_KEYS = new Set<string>(WEBHOOK_EVENT_TYPES.map((e) => e.key));

export function isValidWebhookEventType(key: string): key is WebhookEventType {
  return VALID_KEYS.has(key);
}
