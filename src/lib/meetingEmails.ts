import { escapeHtml } from "@/lib/escapeHtml";
import { sendEmail } from "@/lib/email";
import { applyTemplateVars, getEmailTemplate } from "@/lib/emailTemplates";
import { calVideoUrl } from "@/lib/calcom";
import { buildIcsInvite, icsAttachment } from "@/lib/ics";
import { createMeetingManageToken } from "@/lib/meetingManageToken";
import { SITE_URL, SITE_HOSTNAME, emailAt } from "@/lib/liveSiteUrl";

// Owner's own timezone (confirmed against the connected Cal.com account's
// own settings) -- every owner-facing notification shows the meeting time
// here, regardless of what timezone the attendee booked in, so the owner
// always sees "when do I need to be there" in their own clock.
const OWNER_TIMEZONE = "Asia/Kolkata";
const ORGANIZER_EMAIL = process.env.ADMIN_EMAIL || emailAt("support");

/** Calendar invite UID is keyed off the Cal.com booking uid -- stable across
 * the confirmation and every reminder for the same booking, so calendar apps
 * update one entry instead of duplicating it. A reschedule creates a new
 * calcom_booking_uid (see /api/meetings/[id]/reschedule), so it naturally
 * gets a fresh invite rather than trying to mutate the old one in place. */
function meetingIcsAttachment(input: {
  method: "REQUEST" | "CANCEL";
  calcomBookingUid: string;
  meetingName: string;
  scheduledStart: Date | string;
  scheduledEnd: Date | string;
  attendeeEmail: string;
  attendeeName: string;
}) {
  const joinUrl = calVideoUrl(input.calcomBookingUid);
  return icsAttachment(buildIcsInvite({
    uid: `meeting-${input.calcomBookingUid}@${SITE_HOSTNAME}`,
    method: input.method,
    summary: input.meetingName,
    description: `Join here: ${joinUrl}`,
    location: joinUrl,
    url: joinUrl,
    start: new Date(input.scheduledStart),
    end: new Date(input.scheduledEnd),
    organizerEmail: ORGANIZER_EMAIL,
    attendeeEmail: input.attendeeEmail,
    attendeeName: input.attendeeName,
  }));
}

function formatDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short", timeZone }).format(date);
}

function safeMeetingDate(date: Date | string, timeZone: string): string {
  try { return escapeHtml(formatDate(new Date(date), timeZone)); }
  catch { return escapeHtml(new Date(date).toISOString()); }
}

async function deliverTemplate(key: string, to: string, vars: Record<string, string>, attachments?: { name: string; content: string }[]): Promise<boolean> {
  const template = await getEmailTemplate(key);
  const result = await sendEmail({
    to,
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

/** The one manage link every attendee-facing email includes -- lets them
 * reschedule or cancel without an account, via the token in
 * meetingManageToken.ts. */
async function manageLink(bookingId: number): Promise<string> {
  const token = await createMeetingManageToken(bookingId);
  return `${SITE_URL}/book/manage/${encodeURIComponent(token)}`;
}

export async function sendMeetingConfirmation(input: { attendeeEmail: string; attendeeName: string; attendeeTimeZone: string; meetingName: string; scheduledStart: Date | string; scheduledEnd: Date | string; bookingId: number; calcomBookingUid: string }): Promise<boolean> {
  const vars = {
    first_name: escapeHtml(input.attendeeName),
    meeting_name: escapeHtml(input.meetingName),
    session_date: safeMeetingDate(input.scheduledStart, input.attendeeTimeZone),
    join_url: escapeHtml(calVideoUrl(input.calcomBookingUid)),
    manage_url: escapeHtml(await manageLink(input.bookingId)),
  };
  const attachments = [meetingIcsAttachment({
    method: "REQUEST", calcomBookingUid: input.calcomBookingUid, meetingName: input.meetingName,
    scheduledStart: input.scheduledStart, scheduledEnd: input.scheduledEnd,
    attendeeEmail: input.attendeeEmail, attendeeName: input.attendeeName,
  })];
  return deliverTemplate("meeting-confirmation", input.attendeeEmail, vars, attachments);
}

/** Fires when a Cal.com booking webhook can't be matched to any row in our
 * own meeting_types table -- typically means a bookable event type was
 * created directly in Cal.com's dashboard instead of this site's console.
 * Without this alert that booking is silently dropped (upsertBooking
 * returns null): recorded nowhere, no confirmation email, no reminders. */
export async function sendMeetingUnrecognizedTypeAlert(input: { calcomEventTypeId: string | null; calcomEventSlug: string | null; attendeeEmail: string | null; attendeeName: string | null }): Promise<boolean> {
  const ownerEmail = process.env.ADMIN_EMAIL;
  if (!ownerEmail) return false;
  const vars = {
    event_info: escapeHtml(input.calcomEventSlug || input.calcomEventTypeId || "unknown"),
    attendee_info: input.attendeeEmail ? `${escapeHtml(input.attendeeName || "")} (${escapeHtml(input.attendeeEmail)})` : "an attendee",
    console_url: `${SITE_URL}/console/meetings/types`,
  };
  return deliverTemplate("meeting-unrecognized-type-alert", ownerEmail, vars);
}

/** Fires from the daily reconciliation cron when a Cal.com booking in the
 * checked window has no matching row in our own meeting_bookings at all --
 * usually means a BOOKING_CREATED webhook was never delivered or failed.
 * Deliberately just reports this rather than auto-inserting a guessed row. */
export async function sendMeetingReconciliationOrphanAlert(input: { count: number; exampleUid: string }): Promise<boolean> {
  const ownerEmail = process.env.ADMIN_EMAIL;
  if (!ownerEmail) return false;
  const vars = { count: String(input.count), example_uid: escapeHtml(input.exampleUid) };
  return deliverTemplate("meeting-reconciliation-orphan-alert", ownerEmail, vars);
}

export async function sendMeetingOwnerNotification(input: { attendeeName: string; attendeeEmail: string; meetingName: string; scheduledStart: Date | string; bookingId: number; notes?: string | null }): Promise<boolean> {
  const ownerEmail = process.env.ADMIN_EMAIL;
  if (!ownerEmail) return false;
  const vars = {
    attendee_name: escapeHtml(input.attendeeName),
    attendee_email: escapeHtml(input.attendeeEmail),
    meeting_name: escapeHtml(input.meetingName),
    session_date: safeMeetingDate(input.scheduledStart, OWNER_TIMEZONE),
    notes_block: input.notes ? `<p><strong>What they want to discuss:</strong> ${escapeHtml(input.notes)}</p>` : "",
    console_url: `${SITE_URL}/console/meetings`,
  };
  return deliverTemplate("meeting-owner-new-booking", ownerEmail, vars);
}

export async function sendMeetingCancellation(input: { attendeeEmail: string; attendeeName: string; meetingName: string; cancellationReason?: string | null; calcomBookingUid: string; scheduledStart: Date | string; scheduledEnd: Date | string }): Promise<boolean> {
  const vars = {
    first_name: escapeHtml(input.attendeeName),
    meeting_name: escapeHtml(input.meetingName),
    reason: input.cancellationReason ? escapeHtml(input.cancellationReason) : "No reason was provided.",
  };
  // CANCEL, same UID as the original invite -- calendar apps remove the
  // entry from the attendee's calendar rather than adding another one.
  const attachments = [meetingIcsAttachment({
    method: "CANCEL", calcomBookingUid: input.calcomBookingUid, meetingName: input.meetingName,
    scheduledStart: input.scheduledStart, scheduledEnd: input.scheduledEnd,
    attendeeEmail: input.attendeeEmail, attendeeName: input.attendeeName,
  })];
  return deliverTemplate("meeting-cancelled", input.attendeeEmail, vars, attachments);
}

/** Owner-facing counterpart to sendMeetingCancellation/sendMeetingReschedule --
 * only called when the ATTENDEE self-serves via their manage link (never when
 * the owner does it themselves from the console), so the owner isn't the
 * last to know their own call disappeared or moved. */
export async function sendMeetingOwnerCancelledNotice(input: { attendeeName: string; attendeeEmail: string; meetingName: string; scheduledStart: Date | string; cancellationReason?: string | null }): Promise<boolean> {
  const ownerEmail = process.env.ADMIN_EMAIL;
  if (!ownerEmail) return false;
  const vars = {
    attendee_name: escapeHtml(input.attendeeName),
    attendee_email: escapeHtml(input.attendeeEmail),
    meeting_name: escapeHtml(input.meetingName),
    session_date: safeMeetingDate(input.scheduledStart, OWNER_TIMEZONE),
    reason: input.cancellationReason ? escapeHtml(input.cancellationReason) : "No reason was provided.",
    console_url: `${SITE_URL}/console/meetings`,
  };
  return deliverTemplate("meeting-owner-cancelled-notice", ownerEmail, vars);
}

export async function sendMeetingOwnerRescheduledNotice(input: { attendeeName: string; attendeeEmail: string; meetingName: string; scheduledStart: Date | string }): Promise<boolean> {
  const ownerEmail = process.env.ADMIN_EMAIL;
  if (!ownerEmail) return false;
  const vars = {
    attendee_name: escapeHtml(input.attendeeName),
    attendee_email: escapeHtml(input.attendeeEmail),
    meeting_name: escapeHtml(input.meetingName),
    session_date: safeMeetingDate(input.scheduledStart, OWNER_TIMEZONE),
    console_url: `${SITE_URL}/console/meetings`,
  };
  return deliverTemplate("meeting-owner-rescheduled-notice", ownerEmail, vars);
}

export async function sendMeetingReschedule(input: { attendeeEmail: string; attendeeName: string; attendeeTimeZone: string; meetingName: string; scheduledStart: Date | string; scheduledEnd: Date | string; bookingId: number; calcomBookingUid: string }): Promise<boolean> {
  const vars = {
    first_name: escapeHtml(input.attendeeName),
    meeting_name: escapeHtml(input.meetingName),
    session_date: safeMeetingDate(input.scheduledStart, input.attendeeTimeZone),
    join_url: escapeHtml(calVideoUrl(input.calcomBookingUid)),
    manage_url: escapeHtml(await manageLink(input.bookingId)),
  };
  // The Cal.com reschedule flow issues a new calcom_booking_uid, so this is
  // effectively a fresh invite (new UID) rather than an update to the old
  // one -- calendar apps will show it as a new event.
  const attachments = [meetingIcsAttachment({
    method: "REQUEST", calcomBookingUid: input.calcomBookingUid, meetingName: input.meetingName,
    scheduledStart: input.scheduledStart, scheduledEnd: input.scheduledEnd,
    attendeeEmail: input.attendeeEmail, attendeeName: input.attendeeName,
  })];
  return deliverTemplate("meeting-rescheduled", input.attendeeEmail, vars, attachments);
}

export async function sendMeetingReminder(input: { attendeeEmail: string; attendeeName: string; attendeeTimeZone: string; meetingName: string; scheduledStart: Date | string; scheduledEnd: Date | string; bookingId: number; calcomBookingUid: string; reminderType: "24h" | "1h" }): Promise<boolean> {
  const vars = {
    first_name: escapeHtml(input.attendeeName),
    meeting_name: escapeHtml(input.meetingName),
    session_date: safeMeetingDate(input.scheduledStart, input.attendeeTimeZone),
    join_url: escapeHtml(calVideoUrl(input.calcomBookingUid)),
  };
  const attachments = [meetingIcsAttachment({
    method: "REQUEST", calcomBookingUid: input.calcomBookingUid, meetingName: input.meetingName,
    scheduledStart: input.scheduledStart, scheduledEnd: input.scheduledEnd,
    attendeeEmail: input.attendeeEmail, attendeeName: input.attendeeName,
  })];
  return deliverTemplate(input.reminderType === "1h" ? "meeting-reminder-1h" : "meeting-reminder-24h", input.attendeeEmail, vars, attachments);
}

/** Sent once, the first time Cal.com reports a guest no-show for a booking
 * (the webhook route guards this with an UPDATE ... WHERE guest_no_show =
 * false so a redelivered webhook can't send it twice). Recovering a
 * no-show with a quick rebook offer is one of the higher-converting emails
 * a booking funnel can send. */
export async function sendMeetingNoShowRecovery(input: { attendeeEmail: string; attendeeName: string; meetingName: string; meetingSlug: string }): Promise<boolean> {
  const vars = {
    first_name: escapeHtml(input.attendeeName),
    meeting_name: escapeHtml(input.meetingName),
    rebook_url: `${SITE_URL}/book/${encodeURIComponent(input.meetingSlug)}`,
  };
  return deliverTemplate("meeting-no-show-recovery", input.attendeeEmail, vars);
}

/** Sent once, the first time a booking transitions to "completed" (the
 * webhook route guards this with an UPDATE ... WHERE status = 'confirmed'
 * so a redelivered MEETING_ENDED webhook can't send it twice). */
export async function sendMeetingFollowUp(input: { attendeeEmail: string; attendeeName: string; meetingName: string }): Promise<boolean> {
  const vars = { first_name: escapeHtml(input.attendeeName), meeting_name: escapeHtml(input.meetingName) };
  return deliverTemplate("meeting-follow-up", input.attendeeEmail, vars);
}
