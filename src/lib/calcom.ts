import crypto from "node:crypto";

const CALCOM_API_URL = "https://api.cal.com/v2";
const SLOTS_API_VERSION = "2024-09-04";
const BOOKINGS_API_VERSION = "2026-02-25";
const EVENT_TYPES_API_VERSION = "2024-06-14";
const SCHEDULES_API_VERSION = "2024-06-11";

export type CalcomMeetingType = {
  id: number;
  slug: string;
  name: string;
  duration_minutes: number;
  calcom_event_type_id: string;
  calcom_username: string;
  calcom_event_slug: string;
};

export type CalcomBooking = Record<string, unknown> & {
  uid?: string;
  bookingUid?: string;
  start?: string;
  end?: string;
  startTime?: string;
  endTime?: string;
};

export type CalcomApiResponse<T> = { status: "success" | "error" | string; data: T; error?: unknown };

function getApiKey(): string {
  const key = process.env.CALCOM_API_KEY?.trim();
  if (!key) throw new Error("CALCOM_API_KEY is not configured.");
  return key;
}

async function calcomFetch<T>(path: string, init: RequestInit & { apiVersion: string }): Promise<CalcomApiResponse<T>> {
  const { apiVersion, ...requestInit } = init;
  const response = await fetch(`${CALCOM_API_URL}${path}`, {
    ...requestInit,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "cal-api-version": apiVersion,
      "Content-Type": "application/json",
      ...(requestInit.headers || {}),
    },
  });
  const body = await response.json().catch(() => null) as CalcomApiResponse<T> | null;
  if (!response.ok || !body || body.status === "error") {
    // Cal.com's error payload is normally {code, message, details}, e.g.
    // "Rescheduling past bookings is not allowed for this event type" --
    // surface just that human message where present, since callers show
    // this straight to an admin, and the raw JSON blob isn't readable.
    const errorObj = body?.error && typeof body.error === "object" ? body.error as Record<string, unknown> : null;
    const readableMessage = errorObj && typeof errorObj.message === "string" && errorObj.message.trim() ? errorObj.message.trim() : null;
    const message = readableMessage || (errorObj ? JSON.stringify(errorObj).slice(0, 500) : `Cal.com returned HTTP ${response.status}`);
    throw new Error(message);
  }
  return body;
}

function eventTypeParams(meetingType: CalcomMeetingType): URLSearchParams {
  const params = new URLSearchParams();
  if (/^\d+$/.test(meetingType.calcom_event_type_id)) params.set("eventTypeId", meetingType.calcom_event_type_id);
  else {
    params.set("eventTypeSlug", meetingType.calcom_event_slug);
    params.set("username", meetingType.calcom_username);
  }
  return params;
}

export async function fetchAvailability({ meetingType, start, end, timeZone, bookingUidToReschedule }: {
  meetingType: CalcomMeetingType; start: string; end: string; timeZone: string; bookingUidToReschedule?: string;
}): Promise<CalcomApiResponse<Record<string, unknown>>> {
  const params = eventTypeParams(meetingType);
  params.set("start", start); params.set("end", end); params.set("timeZone", timeZone); params.set("format", "range");
  if (bookingUidToReschedule) params.set("bookingUidToReschedule", bookingUidToReschedule);
  return calcomFetch<Record<string, unknown>>(`/slots?${params.toString()}`, { method: "GET", apiVersion: SLOTS_API_VERSION });
}

export async function createBooking({ meetingType, start, attendee, metadata }: {
  meetingType: CalcomMeetingType; start: string; attendee: { name: string; email: string; timeZone: string; phoneNumber?: string }; metadata?: Record<string, string>;
}): Promise<CalcomApiResponse<CalcomBooking>> {
  const eventParams = eventTypeParams(meetingType);
  const eventTypeId = eventParams.get("eventTypeId");
  const payload: Record<string, unknown> = {
    ...(eventTypeId ? { eventTypeId: Number(eventTypeId) } : {
      eventTypeSlug: meetingType.calcom_event_slug,
      username: meetingType.calcom_username,
    }),
    start, attendee,
    metadata: { meeting_type_slug: meetingType.slug, ...(metadata || {}) },
  };
  return calcomFetch<CalcomBooking>("/bookings", { method: "POST", body: JSON.stringify(payload), apiVersion: BOOKINGS_API_VERSION });
}

export type CalcomBookingListItem = { uid: string; status: string; start: string; end: string };

/** Lists bookings in a date range, cursor-paginated -- used only by the
 * reconciliation cron (defense in depth against a missed/failed webhook),
 * never on any user-facing path. Cal.com's list statuses (accepted/
 * cancelled/rejected/pending) are its own vocabulary, distinct from this
 * app's own status column; callers translate as needed. */
export async function listBookings({ afterStart, beforeEnd, cursor, limit = 100 }: {
  afterStart: string; beforeEnd: string; cursor?: string; limit?: number;
}): Promise<{ bookings: CalcomBookingListItem[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ afterStart, beforeEnd, take: String(limit) });
  if (cursor) params.set("cursor", cursor);
  const result = await calcomFetch<CalcomBookingListItem[] | { bookings: CalcomBookingListItem[] }>(`/bookings?${params.toString()}`, { method: "GET", apiVersion: BOOKINGS_API_VERSION });
  const data = result.data as unknown;
  const bookings = Array.isArray(data) ? data : (data as { bookings?: CalcomBookingListItem[] })?.bookings || [];
  const pagination = (result as unknown as { pagination?: { nextCursor?: string | null } }).pagination;
  return { bookings, nextCursor: pagination?.nextCursor || null };
}

export async function cancelBooking(bookingUid: string, cancellationReason = "User requested cancellation"): Promise<CalcomApiResponse<CalcomBooking>> {
  return calcomFetch<CalcomBooking>(`/bookings/${encodeURIComponent(bookingUid)}/cancel`, { method: "POST", body: JSON.stringify({ cancellationReason }), apiVersion: BOOKINGS_API_VERSION });
}

export async function rescheduleBooking({ bookingUid, start, rescheduledBy, reschedulingReason }: {
  bookingUid: string; start: string; rescheduledBy: string; reschedulingReason?: string;
}): Promise<CalcomApiResponse<CalcomBooking>> {
  return calcomFetch<CalcomBooking>(`/bookings/${encodeURIComponent(bookingUid)}/reschedule`, {
    method: "POST", body: JSON.stringify({ start, rescheduledBy, reschedulingReason: reschedulingReason || "User requested reschedule" }), apiVersion: BOOKINGS_API_VERSION,
  });
}

export type CalcomEventTypeConfig = {
  id: number;
  slug: string;
  title: string;
  lengthInMinutes: number;
  description: string | null;
  hidden: boolean;
  minimumBookingNotice: number;
  beforeEventBuffer: number;
  afterEventBuffer: number;
};

let cachedUsername: string | null = null;

/** The connected Cal.com account's own username -- only relevant as a
 * fallback path in eventTypeParams() when an event type's numeric id isn't
 * available, but every meeting type created through this app always has
 * one, so this is mostly stored for completeness/future-proofing. Cached
 * for the life of the process; it doesn't change at runtime. */
export async function getAccountUsername(): Promise<string> {
  if (cachedUsername) return cachedUsername;
  const result = await calcomFetch<{ username: string }>("/me", { method: "GET", apiVersion: EVENT_TYPES_API_VERSION });
  cachedUsername = result.data.username;
  return cachedUsername;
}

export async function getEventType(eventTypeId: string): Promise<CalcomEventTypeConfig> {
  const result = await calcomFetch<CalcomEventTypeConfig>(`/event-types/${encodeURIComponent(eventTypeId)}`, { method: "GET", apiVersion: EVENT_TYPES_API_VERSION });
  return result.data;
}

/** Creates a Cal.com event type for a brand-new meeting type. Always
 * hidden on Cal.com's own public booking page -- this site's /book/[slug]
 * is the only place a visitor ever books through. */
export async function createEventType(input: {
  title: string; slug: string; lengthInMinutes: number; description?: string;
  minimumBookingNotice?: number; beforeEventBuffer?: number; afterEventBuffer?: number;
}): Promise<CalcomEventTypeConfig> {
  const result = await calcomFetch<CalcomEventTypeConfig>("/event-types", {
    method: "POST",
    apiVersion: EVENT_TYPES_API_VERSION,
    body: JSON.stringify({
      title: input.title,
      slug: input.slug,
      lengthInMinutes: input.lengthInMinutes,
      description: input.description || undefined,
      hidden: true,
      minimumBookingNotice: input.minimumBookingNotice,
      beforeEventBuffer: input.beforeEventBuffer,
      afterEventBuffer: input.afterEventBuffer,
      // Cal.com's own scheduling-layer enforcement that one attendee can't
      // hold more than one not-yet-happened booking for this event type at
      // once -- offerReschedule lets them move their existing booking to a
      // new time instead of just getting rejected. Applied to every new
      // meeting type by default; also enforced independently in our own
      // /api/meetings/book (defense in depth, and a faster/clearer error
      // before ever calling out to Cal.com).
      bookerActiveBookingsLimit: { maximumActiveBookings: 1, offerReschedule: true },
    }),
  });
  return result.data;
}

export async function updateEventType(eventTypeId: string, input: {
  title?: string; lengthInMinutes?: number; description?: string;
  minimumBookingNotice?: number; beforeEventBuffer?: number; afterEventBuffer?: number;
}): Promise<CalcomEventTypeConfig> {
  const result = await calcomFetch<CalcomEventTypeConfig>(`/event-types/${encodeURIComponent(eventTypeId)}`, {
    method: "PATCH",
    apiVersion: EVENT_TYPES_API_VERSION,
    body: JSON.stringify(input),
  });
  return result.data;
}

export async function deleteEventType(eventTypeId: string): Promise<void> {
  await calcomFetch<unknown>(`/event-types/${encodeURIComponent(eventTypeId)}`, { method: "DELETE", apiVersion: EVENT_TYPES_API_VERSION });
}

export type CalcomWeekday = "Sunday" | "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday";
export type CalcomAvailabilitySlot = { days: CalcomWeekday[]; startTime: string; endTime: string };
export type CalcomScheduleOverride = { date: string; startTime: string; endTime: string };
export type CalcomSchedule = { id: number; name: string; timeZone: string; availability: CalcomAvailabilitySlot[]; overrides: CalcomScheduleOverride[]; isDefault: boolean };

/** The account's default weekly Availability schedule -- this, not
 * anything in our own app, is what actually decides which hours show up
 * as bookable slots. Controllable from our own console via updateSchedule
 * so the owner never has to open Cal.com's dashboard for this either. */
export async function getDefaultSchedule(): Promise<CalcomSchedule> {
  const result = await calcomFetch<CalcomSchedule[]>("/schedules", { method: "GET", apiVersion: SCHEDULES_API_VERSION });
  const schedules = result.data;
  const found = schedules.find((s) => s.isDefault) || schedules[0];
  if (!found) throw new Error("No Cal.com availability schedule exists on this account.");
  return { ...found, overrides: found.overrides || [] };
}

export async function updateSchedule(scheduleId: number, input: { timeZone: string; availability: CalcomAvailabilitySlot[]; overrides: CalcomScheduleOverride[] }): Promise<CalcomSchedule> {
  const result = await calcomFetch<CalcomSchedule>(`/schedules/${scheduleId}`, {
    method: "PATCH",
    apiVersion: SCHEDULES_API_VERSION,
    body: JSON.stringify({ timeZone: input.timeZone, availability: input.availability, overrides: input.overrides }),
  });
  return { ...result.data, overrides: result.data.overrides || [] };
}

/** Cal.com signs the exact raw request body with HMAC-SHA256. */
export function verifyCalcomWebhookSignature(secret: string, rawBody: string, signature: string | null | undefined): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(provided) || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function bookingUidFromCalcom(data: CalcomBooking): string | null {
  const uid = data.uid ?? data.bookingUid;
  return typeof uid === "string" && uid.trim() ? uid.trim() : null;
}

export function bookingStartFromCalcom(data: CalcomBooking): string | null {
  const value = data.start ?? data.startTime;
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

export function bookingEndFromCalcom(data: CalcomBooking): string | null {
  const value = data.end ?? data.endTime;
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

/** The actual meeting room -- Cal.com's own Cal Video (owner's explicit
 * decision, 2026-08-29: no separate Daily.co integration; booking,
 * tracking, and every notification still happen on our own site, only the
 * live call itself happens on Cal.com). This URL pattern is Cal Video's
 * own stable convention, confirmed live against a real booking. */
export function calVideoUrl(bookingUid: string): string {
  return `https://app.cal.com/video/${encodeURIComponent(bookingUid)}`;
}
