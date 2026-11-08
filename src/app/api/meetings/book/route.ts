import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession, getSession } from "@/lib/auth";
import { sendTransactionalWhatsApp } from "@/lib/whatsappTransactional";
import { setWhatsAppStatusIfNotOptedOut } from "@/lib/whatsappContacts";
import { ensureContact, confirmContactSubscribed } from "@/lib/contacts";
import { calVideoUrl, createBooking } from "@/lib/calcom";
import { pool, withTransaction } from "@/lib/db";
import { sendMeetingConfirmation, sendMeetingOwnerNotification } from "@/lib/meetingEmails";
import { bookingDataFromCalcom, getMeetingTypeBySlug, isValidDateTime, isValidTimeZone } from "@/lib/meetingUtils";
import { consumeRateLimit } from "@/lib/rateLimit";
import { normalizeCountry } from "@/lib/countries";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { hasActiveWorkflowActionForEvent } from "@/lib/workflows";

const bookingSchema = z.object({ slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]*$/).max(120), start: z.string().trim().min(10).max(64), name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(254), timezone: z.string().trim().min(1).max(100), notes: z.string().trim().max(1000).optional(), updatesOptIn: z.boolean().optional(), whatsappOptIn: z.boolean().optional(), country: z.string().trim().max(2).optional(), phone: z.string().trim().regex(/^\d{4,15}$/).optional() });

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await consumeRateLimit(`meeting-book:${ip}`, 10, 60 * 60 * 1000))) return NextResponse.json({ error: "Too many booking attempts. Try again later." }, { status: 429 });
  const parsed = bookingSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid booking details." }, { status: 400 });
  const { slug, start, name, timezone } = parsed.data; const email = parsed.data.email.toLowerCase();
  const notes = parsed.data.notes || null;
  if (!isValidDateTime(start) || !isValidTimeZone(timezone)) return NextResponse.json({ error: "Invalid start time or timezone." }, { status: 400 });
  const startDate = new Date(start);
  if (startDate.getTime() <= Date.now() || startDate.getTime() > Date.now() + 366 * 86400000) return NextResponse.json({ error: "Choose a future time within the next year." }, { status: 400 });
  const meetingType = await getMeetingTypeBySlug(slug);
  if (!meetingType) return NextResponse.json({ error: "Meeting type not found." }, { status: 404 });

  // Every public booking needs a number -- the call confirmation and
  // reminders go out on WhatsApp as well as email. The console's own "Add
  // booking" tool posts here too (see ConsoleAddMeeting.tsx), for someone
  // who agreed a time by phone or email, and the owner may not have their
  // number, so an admin session is allowed to book without one.
  if (!parsed.data.phone && !(await getAdminSession())) {
    return NextResponse.json({ error: "Enter your phone number." }, { status: 400 });
  }

  // Defense in depth: Cal.com's own bookerActiveBookingsLimit enforces this
  // too (set on every meeting type this app creates), but checking here
  // first is faster, gives a clearer message, and doesn't depend on that
  // Cal.com-side setting having been correctly applied. Scoped per meeting
  // type, not globally, to match Cal.com's own per-event-type semantics --
  // an existing discovery call shouldn't block booking an unrelated type.
  const existingActive = await pool.query(
    `SELECT id FROM meeting_bookings WHERE meeting_type_id = $1 AND attendee_email = $2 AND status = 'confirmed' AND scheduled_start > now() LIMIT 1`,
    [meetingType.id, email]
  );
  if (existingActive.rows[0]) {
    return NextResponse.json({ error: "You already have an upcoming booking for this. Check your email for the link, or cancel it first if you need a different time." }, { status: 409 });
  }

  const session = await getSession();
  const userId = session && session.email.toLowerCase() === email ? session.userId : null;
  let calResult;
  try {
    calResult = await createBooking({ meetingType, start: startDate.toISOString(), attendee: { name, email, timeZone: timezone }, metadata: notes ? { notes } : undefined });
  } catch (error) {
    console.error("Cal.com booking request failed:", error);
    // 409, not 502/503/504: Cloudflare intercepts those gateway-error codes
    // and replaces the response body with its own generic HTML error page,
    // which breaks the widget's res.json() call. A 409 (conflict -- the
    // slot became unavailable between page load and submit, the common
    // real-world cause here) passes through untouched.
    return NextResponse.json({ error: "That time is no longer available. Please pick another slot." }, { status: 409 });
  }
  const bookingData = bookingDataFromCalcom(calResult.data, startDate, meetingType.duration_minutes);
  if (!bookingData.uid) return NextResponse.json({ error: "Received an invalid booking response. Please try again." }, { status: 500 });
  const saved = await withTransaction(async (client) => {
    // Country is no longer asked for: it comes from the visitor's network.
    const country = normalizeCountry(parsed.data.country) ?? normalizeCountry(req.headers.get("cf-ipcountry"));
    const contactId = await ensureContact({
      email, name, userId, country, countrySource: "ip",
      phone: parsed.data.phone || null,
      phoneSource: parsed.data.phone ? "form" : undefined,
    }, client);
    // Marketing consent only when the booker left the updates box ticked
    // (console-created bookings never send it). confirmContactSubscribed
    // still respects an earlier explicit unsubscribe.
    if (parsed.data.updatesOptIn === true) await confirmContactSubscribed(email, client);
    // The WhatsApp box is its own answer. Not deferred the way signup is:
    // the number was typed on this form and the confirmation goes to it
    // within seconds, so there is nothing left to verify.
    if (parsed.data.whatsappOptIn === true && parsed.data.phone) {
      await setWhatsAppStatusIfNotOptedOut(contactId, "subscribed", "booking", client);
    }
    const inserted = await client.query(`INSERT INTO meeting_bookings (meeting_type_id, calcom_booking_uid, user_id, contact_id, attendee_name, attendee_email, attendee_timezone, scheduled_start, scheduled_end, status, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'confirmed', $10) ON CONFLICT (calcom_booking_uid) DO NOTHING RETURNING id, calcom_booking_uid, meeting_type_id, contact_id, attendee_email, attendee_name, attendee_timezone, scheduled_start, scheduled_end, status, notes`, [meetingType.id, bookingData.uid, userId, contactId, name, email, timezone, bookingData.start, bookingData.end, notes]);
    if (inserted.rows[0]) return { row: inserted.rows[0], inserted: true };
    const existing = await client.query(`SELECT id, calcom_booking_uid, meeting_type_id, contact_id, attendee_email, attendee_name, attendee_timezone, scheduled_start, scheduled_end, status FROM meeting_bookings WHERE calcom_booking_uid = $1`, [bookingData.uid]);
    return { row: existing.rows[0], inserted: false };
  });
  if (!saved.row) return NextResponse.json({ error: "Could not save booking." }, { status: 500 });
  let workflowEventEmitted = false;
  if (saved.inserted) {
    await emitWebhookEvent({
      eventType: "meeting.booked",
      source: "meeting_bookings",
      sourceRecordId: saved.row.id,
      contactEmail: email,
      contactName: name,
      userId,
      data: {
        booking_id: saved.row.id,
        meeting_type_id: meetingType.id,
        meeting_name: meetingType.name,
        name,
        email,
        phone: parsed.data.phone || "",
        timezone,
        scheduled_start: new Date(saved.row.scheduled_start).toISOString(),
        scheduled_end: new Date(saved.row.scheduled_end).toISOString(),
        calcom_booking_uid: saved.row.calcom_booking_uid,
        join_link: calVideoUrl(saved.row.calcom_booking_uid),
        booking_page: `${SITE_URL}/book/${slug}`,
      },
    }).then(() => { workflowEventEmitted = true; }).catch((err) => console.error("Meeting booked workflow event failed:", err));
  }
  const workflowSendsEmail = workflowEventEmitted && await hasActiveWorkflowActionForEvent("meeting.booked", "email").catch(() => false);
  const emailSent = saved.inserted && !workflowSendsEmail ? await sendMeetingConfirmation({ attendeeEmail: saved.row.attendee_email, attendeeName: saved.row.attendee_name, attendeeTimeZone: saved.row.attendee_timezone, meetingName: meetingType.name, scheduledStart: saved.row.scheduled_start, scheduledEnd: saved.row.scheduled_end, bookingId: Number(saved.row.id), calcomBookingUid: saved.row.calcom_booking_uid }) : false;
  if (saved.inserted) {
    // Sent directly from here rather than relying on the Cal.com webhook's
    // own new-booking path: this route's INSERT above almost always
    // completes before Cal.com's separate webhook delivery arrives, so the
    // webhook would otherwise always find the row already existing and
    // never notify the owner at all for bookings made through this site's
    // own widget. The webhook keeps its own notification too, as a fallback
    // for the rare case a booking is created any other way.
    sendMeetingOwnerNotification({ attendeeName: saved.row.attendee_name, attendeeEmail: saved.row.attendee_email, meetingName: meetingType.name, scheduledStart: saved.row.scheduled_start, bookingId: Number(saved.row.id), notes: saved.row.notes }).catch((err) => console.error("Owner new-booking notification failed:", err));

    // Best-effort, same as the purchase confirmation: the email above is the
    // reliable one (it carries the joining link and the .ics), so a WhatsApp
    // failure is logged rather than failing a booking that already exists.
    const workflowSendsWhatsApp = workflowEventEmitted && await hasActiveWorkflowActionForEvent("meeting.booked", "whatsapp").catch(() => false);
    if (parsed.data.phone && !workflowSendsWhatsApp) {
      const when = new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short", timeZone: saved.row.attendee_timezone }).format(new Date(saved.row.scheduled_start));
      sendTransactionalWhatsApp({
        phone: parsed.data.phone,
        templateName: "booking_confirmation",
        languageCode: "en",
        contactId: Number(saved.row.contact_id) || null,
        variableValues: {
          "contact.first_name": name.trim().split(/\s+/)[0] || "there",
          "contact.full_name": name,
          "contact.email": email,
          "contact.phone": parsed.data.phone,
          "booking.meeting_name": meetingType.name,
          "booking.scheduled_datetime": `${when} (${saved.row.attendee_timezone})`,
          "booking.timezone": saved.row.attendee_timezone,
          "booking.join_link": calVideoUrl(saved.row.calcom_booking_uid),
          "booking.booking_page": `${SITE_URL}/book/${slug}`,
        },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: name.split(/\s+/)[0] || "there" },
              { type: "text", text: meetingType.name },
              { type: "text", text: `${when} (${saved.row.attendee_timezone})` },
              { type: "text", text: calVideoUrl(saved.row.calcom_booking_uid) },
            ],
          },
        ],
        description: `booking confirmation for ${email}`,
        dedupeKey: `whatsapp_send_failed:booking:${saved.row.id}`,
      }).catch(() => {});
    }
  }
  return NextResponse.json({ ok: true, booking: { ...saved.row, id: Number(saved.row.id) }, emailSent }, { status: saved.inserted ? 201 : 200 });
}
