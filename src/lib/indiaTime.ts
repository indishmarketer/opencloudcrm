const IST_OFFSET = "+05:30";

/** Parses a datetime-local value as India Standard Time regardless of the
 * browser or server timezone. Returns null when it is malformed or not in
 * the future. */
export function parseIndiaDateTime(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00${IST_OFFSET}`);
  if (!Number.isFinite(date.getTime()) || indiaDateTimeInput(date) !== value || date.getTime() <= Date.now()) return null;
  return date;
}

/** datetime-local displays a timezone-free string. Build that string from
 * the fixed IST offset instead of the machine's local timezone. */
export function indiaDateTimeInput(date: Date): string {
  const shifted = new Date(date.getTime() + 330 * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export function formatIndiaDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
