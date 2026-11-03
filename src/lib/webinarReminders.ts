export type WebinarEmailType = "24h" | "1h" | "follow_up";

const HOUR_MS = 60 * 60 * 1000;

export function dueWebinarEmailType(
  sessionStart: Date | string,
  durationSeconds: number,
  now: Date = new Date(),
): WebinarEmailType | null {
  const start = new Date(sessionStart).getTime();
  const current = now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(current) || durationSeconds <= 0) return null;
  const untilStart = start - current;
  if (untilStart > 0 && untilStart <= HOUR_MS) return "1h";
  if (untilStart > HOUR_MS && untilStart <= 24 * HOUR_MS) return "24h";
  const sinceEnd = current - (start + durationSeconds * 1000);
  if (sinceEnd >= 0 && sinceEnd <= HOUR_MS) return "follow_up";
  return null;
}

export function formatWebinarSession(date: Date | string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short", timeZone }).format(new Date(date));
  } catch {
    return new Date(date).toISOString();
  }
}

export function formatWebinarSessionWindow(date: Date | string, durationSeconds: number | null, timeZone: string): string {
  const start = new Date(date);
  if (!durationSeconds || !Number.isFinite(start.getTime())) return formatWebinarSession(date, timeZone);
  const end = new Date(start.getTime() + durationSeconds * 1000);
  try {
    const day = new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeZone }).format(start);
    const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" });
    return `${day}, ${time.format(start)} to ${time.format(end)}`;
  } catch {
    return `${start.toISOString()} to ${end.toISOString()}`;
  }
}

export function webinarDurationLabel(durationSeconds: number | null): string {
  if (!durationSeconds) return "Duration announced in the room";
  return `${Math.max(1, Math.ceil(durationSeconds / 60))} minutes`;
}
