import { sendEmail } from "@/lib/email";
import { applyTemplateVars, getEmailTemplate } from "@/lib/emailTemplates";
import { escapeHtml } from "@/lib/escapeHtml";
import { buildIcsInvite, icsAttachment } from "@/lib/ics";
import { formatWebinarSessionWindow, webinarDurationLabel, type WebinarEmailType } from "@/lib/webinarReminders";
import { SITE_URL, SITE_HOSTNAME, emailAt } from "@/lib/liveSiteUrl";

const ORGANIZER_EMAIL = process.env.ADMIN_EMAIL || emailAt("support");

type WebinarEmailInput = {
  email: string;
  name: string;
  title: string;
  slug: string;
  sessionStartAt: Date | string;
  attendeeTimezone: string;
  durationSeconds: number | null;
  /** webinar_access.id -- stable per (webinar, attendee), used as the
   * calendar invite's UID so the confirmation and every reminder update the
   * same calendar entry instead of creating duplicates. */
  accessId: number;
};

function templateKey(type: "confirmation" | WebinarEmailType): string {
  if (type === "confirmation") return "webinar-registration-confirmation";
  if (type === "24h") return "webinar-reminder-24h";
  if (type === "1h") return "webinar-reminder-1h";
  return "webinar-follow-up";
}

export async function sendWebinarEmail(type: "confirmation" | WebinarEmailType, input: WebinarEmailInput): Promise<boolean> {
  const template = await getEmailTemplate(templateKey(type));
  const roomUrl = `${SITE_URL}/webinars/${encodeURIComponent(input.slug)}/room`;
  const landingUrl = `${SITE_URL}/webinars/${encodeURIComponent(input.slug)}`;
  const vars = {
    first_name: escapeHtml(input.name.trim().split(/\s+/)[0] || input.name),
    webinar_title: escapeHtml(input.title),
    webinar_url: escapeHtml(type === "follow_up" ? landingUrl : roomUrl),
    session_date: escapeHtml(formatWebinarSessionWindow(input.sessionStartAt, input.durationSeconds, input.attendeeTimezone)),
    session_timezone: escapeHtml(input.attendeeTimezone),
    duration: escapeHtml(webinarDurationLabel(input.durationSeconds)),
  };
  // No "add to calendar" invite for the follow-up email -- the event has
  // already happened by then.
  const attachments = type === "follow_up" ? undefined : [icsAttachment(buildIcsInvite({
    uid: `webinar-access-${input.accessId}@${SITE_HOSTNAME}`,
    method: "REQUEST",
    summary: input.title,
    description: `Join here: ${roomUrl}`,
    location: roomUrl,
    url: roomUrl,
    start: new Date(input.sessionStartAt),
    end: new Date(new Date(input.sessionStartAt).getTime() + (input.durationSeconds || 3600) * 1000),
    organizerEmail: ORGANIZER_EMAIL,
    attendeeEmail: input.email,
    attendeeName: input.name,
  }))];
  const result = await sendEmail({
    to: input.email,
    subject: applyTemplateVars(template.subject, vars),
    html: applyTemplateVars(template.body_html, vars),
    from: template.from_email,
    templateKey: template.key,
    category: "fixed",
    trackOpens: template.track_opens,
    attachments,
  });
  return result.ok;
}

async function deliverTemplate(key: string, to: string, vars: Record<string, string>): Promise<boolean> {
  const template = await getEmailTemplate(key);
  const result = await sendEmail({
    to,
    subject: applyTemplateVars(template.subject, vars),
    html: applyTemplateVars(template.body_html, vars),
    from: template.from_email,
    templateKey: template.key,
    category: "fixed",
    trackOpens: template.track_opens,
  });
  return result.ok;
}

export async function sendWebinarQuestionOwnerAlert(input: { webinarId: number; webinarTitle: string; attendeeName: string; attendeeEmail: string; questionBody: string }): Promise<boolean> {
  const ownerEmail = process.env.ADMIN_EMAIL;
  if (!ownerEmail) return false;
  const vars = {
    attendee_name: escapeHtml(input.attendeeName),
    attendee_email: escapeHtml(input.attendeeEmail),
    webinar_title: escapeHtml(input.webinarTitle),
    question_body: escapeHtml(input.questionBody),
    console_url: `${SITE_URL}/console/webinars/${input.webinarId}/engagement`,
  };
  return deliverTemplate("webinar-question-owner-alert", ownerEmail, vars);
}

export async function sendWebinarProcessingFailedAlert(input: { webinarId: number; webinarTitle: string }): Promise<boolean> {
  const ownerEmail = process.env.ADMIN_EMAIL;
  if (!ownerEmail) return false;
  const vars = {
    webinar_title: escapeHtml(input.webinarTitle),
    console_url: `${SITE_URL}/console/webinars`,
  };
  return deliverTemplate("webinar-processing-failed-alert", ownerEmail, vars);
}

export async function sendWebinarQuestionAnswered(input: { attendeeEmail: string; attendeeName: string; webinarTitle: string; questionBody: string; answerBody: string }): Promise<boolean> {
  const vars = {
    first_name: escapeHtml(input.attendeeName.trim().split(/\s+/)[0] || input.attendeeName),
    webinar_title: escapeHtml(input.webinarTitle),
    question_body: escapeHtml(input.questionBody),
    answer_body: escapeHtml(input.answerBody),
  };
  return deliverTemplate("webinar-question-answered", input.attendeeEmail, vars);
}
