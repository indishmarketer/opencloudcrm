export type WebinarScheduleRule = {
  id?: number;
  schedule_kind: "weekly" | "specific";
  timezone: string;
  weekdays: number[];
  specific_date: string | null;
  local_time: string;
  active?: boolean;
};

export function isValidTimeZone(timeZone: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone }).format(); return true; } catch { return false; }
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

export function localScheduleToUtc(date: string, time: string, timeZone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(time) || !isValidTimeZone(timeZone)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second = 0] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const actual = zonedParts(new Date(guess), timeZone);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    guess += target - represented;
  }
  const result = new Date(guess);
  const verified = zonedParts(result, timeZone);
  return verified.year === year && verified.month === month && verified.day === day && verified.hour === hour && verified.minute === minute ? result : null;
}

export function upcomingWebinarSessions(
  rules: WebinarScheduleRule[],
  now = new Date(),
  limit = 12,
  horizonDays = 366,
  durationSeconds = 0,
): string[] {
  const sessions: number[] = [];
  const lowerBound = now.getTime() - Math.max(5 * 60 * 1000, durationSeconds * 1000);
  const isJoinable = (start: number) => start >= lowerBound && (!durationSeconds || start + durationSeconds * 1000 > now.getTime());
  for (const rule of rules.filter((item) => item.active !== false)) {
    if (!isValidTimeZone(rule.timezone)) continue;
    if (rule.schedule_kind === "specific" && rule.specific_date) {
      const date = localScheduleToUtc(rule.specific_date, rule.local_time, rule.timezone);
      if (date && isJoinable(date.getTime())) sessions.push(date.getTime());
      continue;
    }
    if (rule.schedule_kind !== "weekly" || !rule.weekdays.length) continue;
    const localNow = zonedParts(now, rule.timezone);
    const calendarBase = Date.UTC(localNow.year, localNow.month - 1, localNow.day);
    for (let offset = 0; offset <= horizonDays; offset++) {
      const calendar = new Date(calendarBase + offset * 86400000);
      if (!rule.weekdays.includes(calendar.getUTCDay())) continue;
      const localDate = `${calendar.getUTCFullYear()}-${String(calendar.getUTCMonth() + 1).padStart(2, "0")}-${String(calendar.getUTCDate()).padStart(2, "0")}`;
      const date = localScheduleToUtc(localDate, rule.local_time, rule.timezone);
      if (date && isJoinable(date.getTime())) sessions.push(date.getTime());
    }
  }
  return [...new Set(sessions)].sort((a, b) => a - b).slice(0, limit).map((value) => new Date(value).toISOString());
}

export function isOfferedWebinarSession(value: string, rules: WebinarScheduleRule[], now = new Date(), durationSeconds = 0): boolean {
  const requested = new Date(value);
  if (!Number.isFinite(requested.getTime())) return false;
  return upcomingWebinarSessions(rules, now, 100, 366, durationSeconds).some((session) => Math.abs(new Date(session).getTime() - requested.getTime()) < 60000);
}
