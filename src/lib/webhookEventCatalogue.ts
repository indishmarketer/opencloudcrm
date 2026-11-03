/** The full set of outbound webhook event types this site can emit. Every
 * entry here corresponds to a real, already-existing action -- there is no
 * event for something the app doesn't actually do. To add a new event in the
 * future: add it here, then call emitWebhookEvent() from src/lib/webhookEvents.ts
 * at the real call site that observes the action (see that file's own doc
 * comment for the full pattern). */
export const WEBHOOK_EVENT_TYPES = [
  { key: "contact.created", label: "New contact identified", description: "A brand-new person entered the CRM (signup, newsletter, contact form, voice lead, etc.) for the first time." },
  { key: "user.verified", label: "Account email verified", description: "Someone verifies their email and their account becomes active." },
  { key: "newsletter.subscribed", label: "Newsletter subscribed", description: "Someone confirms a newsletter signup via the OTP code." },
  { key: "newsletter.unsubscribed", label: "Newsletter unsubscribed", description: "Someone unsubscribes from marketing email." },
  { key: "email.bounced", label: "Email bounced", description: "An email provider reports a bounce; includes whether it is permanent, temporary, or undetermined." },
  { key: "email.complained", label: "Email spam complaint", description: "An email recipient reports a message as spam; the address is suppressed immediately." },
  { key: "course.enrolled", label: "Course enrolled", description: "Someone gets access to a course for the first time (free enroll or a fresh PRO purchase)." },
  { key: "course.upgraded", label: "Course upgraded to PRO", description: "An existing free learner upgrades to PRO on a course." },
  { key: "course.completed", label: "Course completed", description: "Someone finishes every lesson they have access to in a course." },
  { key: "course.inactivity", label: "Course inactivity detected", description: "A course learner's last-activity timestamp and course progress; add a wait and send a reminder from one shared workflow." },
  { key: "payment.succeeded", label: "Payment succeeded", description: "A Razorpay or PayPal payment is captured and access is granted." },
  { key: "payment.failed", label: "Payment failed", description: "Razorpay reports a failed course payment; use a condition and recovery message to follow up." },
  { key: "payment_claim.submitted", label: "Manual payment claim submitted", description: "Someone submits a manual payment reference for review." },
  { key: "payment_claim.resolved", label: "Manual payment claim resolved", description: "An admin approves or rejects a manual payment claim." },
  { key: "contact_form.submitted", label: "Contact form submitted", description: "Someone submits the public contact form." },
  { key: "external_webhook.received", label: "External webhook received", description: "A signed inbound webhook reaches this deployment; use the source slug and payload fields in conditions and actions." },
  { key: "meeting.booked", label: "Meeting booked", description: "A visitor books a meeting and receives a confirmed time." },
  { key: "voice_agent.interest", label: "Voice agent lead captured", description: "Someone shares their email while trying the voice agent demo." },
  { key: "author_application.submitted", label: "Author application submitted", description: "Someone applies to write for the blog." },
  { key: "author_application.draft_submitted", label: "Author draft submitted", description: "An approved applicant submits (or resubmits) their draft link." },
  { key: "author_application.accepted", label: "Author draft accepted", description: "An admin accepts an applicant's draft, ready to publish." },
  { key: "directory_tool.submitted", label: "Tool directory submission", description: "Someone submits a tool to the directory." },
  { key: "review.submitted", label: "Review submitted", description: "Someone submits a testimonial/review." },
  { key: "community.post_created", label: "Community post created", description: "Someone creates a forum post (General or PRO space)." },
  { key: "community.member_inactive", label: "Community member inactive", description: "An active community member has not created their first post." },
  { key: "lead_magnet.downloaded", label: "Free guide downloaded", description: "Someone verifies their email after requesting a free guide and reaches its download page." },
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]["key"];

const VALID_KEYS = new Set<string>(WEBHOOK_EVENT_TYPES.map((e) => e.key));

export function isValidWebhookEventType(key: string): key is WebhookEventType {
  return VALID_KEYS.has(key);
}
