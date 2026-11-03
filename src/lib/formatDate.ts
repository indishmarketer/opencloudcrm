/**
 * Dates, written the way the owner reads them.
 *
 * A bare `toLocaleDateString()` is wrong twice over in this app. It picks
 * up whatever locale the process has, and the container's is US, so a
 * server-rendered date printed "8/30/2026" to someone who reads
 * 30/08/2026. Worse, in a client component it renders once on the server
 * with the container locale and again in the browser with the visitor's,
 * which is a hydration mismatch React resolves by throwing the markup
 * away.
 *
 * Pinning both the locale and the time zone makes the output identical
 * wherever it runs, which is what makes it safe in a client component.
 * Asia/Kolkata because that is the business's own clock: a payment made at
 * 1am IST should not be filed under the previous day because the server
 * thinks in UTC.
 */
const DAY_FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
};

const DAY_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  ...DAY_FORMAT,
  hour: "numeric",
  minute: "2-digit",
};

/** "30 Aug 2026". Returns an em dash for a missing date so callers do not
 * each invent their own placeholder. */
export function formatDay(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", DAY_FORMAT);
}

/** "30 Aug 2026, 4:05 pm". */
export function formatDayTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", DAY_TIME_FORMAT);
}
