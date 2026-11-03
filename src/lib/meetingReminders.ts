export type MeetingReminderType = "24h" | "1h";
const HOUR_MS = 60 * 60 * 1000;

/** Returns the reminder due for a future booking; the 1h reminder wins inside its window.
 * When `bookedAt` is given and the booking itself was made less than ~20h before the
 * call, the 24h reminder is skipped entirely -- the confirmation email sent minutes
 * earlier already says "you're booked for tomorrow," so a near-duplicate reminder
 * right after it just reads redundant. The 1h reminder always still fires. */
export function dueMeetingReminderType(scheduledStart: Date | string, now: Date = new Date(), bookedAt?: Date | string | null): MeetingReminderType | null {
  const startMs = new Date(scheduledStart).getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) return null;
  const hoursUntilStart = (startMs - nowMs) / HOUR_MS;
  if (hoursUntilStart <= 0) return null;
  if (hoursUntilStart <= 1) return "1h";
  if (hoursUntilStart <= 24) {
    if (bookedAt != null) {
      const bookedMs = new Date(bookedAt).getTime();
      if (Number.isFinite(bookedMs) && (startMs - bookedMs) / HOUR_MS < 20) return null;
    }
    return "24h";
  }
  return null;
}
