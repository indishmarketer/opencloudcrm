import { pool } from "@/lib/db";
import type { CalcomBooking, CalcomMeetingType } from "@/lib/calcom";
import { bookingEndFromCalcom, bookingStartFromCalcom, bookingUidFromCalcom } from "@/lib/calcom";

export function isValidTimeZone(timeZone: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone }).format(); return true; } catch { return false; }
}

export function isValidDateTime(value: string): boolean { return typeof value === "string" && value.length <= 64 && !Number.isNaN(Date.parse(value)); }

export async function getMeetingTypeBySlug(slug: string): Promise<CalcomMeetingType | null> {
  const result = await pool.query<CalcomMeetingType>(`SELECT id, slug, name, duration_minutes, calcom_event_type_id, calcom_username, calcom_event_slug FROM meeting_types WHERE slug = $1 AND active = true`, [slug]);
  return result.rows[0] || null;
}

export function bookingDataFromCalcom(data: CalcomBooking, fallbackStart: Date, durationMinutes: number) {
  const start = bookingStartFromCalcom(data); const end = bookingEndFromCalcom(data);
  const startDate = start ? new Date(start) : fallbackStart;
  const endDate = end ? new Date(end) : new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  return { uid: bookingUidFromCalcom(data), start: startDate, end: endDate };
}
