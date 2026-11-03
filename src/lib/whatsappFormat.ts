/** Pinned to one timezone on purpose: the conversation list renders on the
 * server (UTC) and the thread renders in the browser, so leaving it to the
 * local zone made the same message read 1:14 am in one place and 7:44 pm
 * the previous day in the other.
 *
 * Lives here rather than in WhatsAppThread.tsx because that file is a
 * client component, and every export of a "use client" module is a client
 * reference -- calling one from a server component throws at runtime. */
const ZONE = "Asia/Kolkata";

/** Just the clock, for a message inside a thread. The day it belongs to is
 * the separator above it, the way a chat app does it, so repeating the date
 * on every bubble is noise. */
export function formatMessageClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: ZONE });
}

/** Which calendar day a timestamp falls on, in the pinned zone. Used to
 * group a thread into days; comparable as a plain string. */
export function messageDayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: ZONE });
}

/** The separator above a day's messages: "Today", "Yesterday", or the date.
 * `now` is passed in rather than read here so the thread, which renders in
 * the browser, does not depend on the reader's clock being right. */
export function formatMessageDay(iso: string, now: string): string {
  const day = messageDayKey(iso);
  const today = messageDayKey(now);
  if (day === today) return "Today";

  const yesterday = messageDayKey(new Date(new Date(now).getTime() - 24 * 60 * 60 * 1000).toISOString());
  if (day === yesterday) return "Yesterday";

  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: messageDayKey(now).slice(0, 4) === day.slice(0, 4) ? undefined : "numeric",
    timeZone: ZONE,
  });
}

/** What the conversation list shows against each row: a clock for today,
 * "Yesterday" for yesterday, a date before that. The full date on every row
 * was the same nine characters over and over on a list where most activity
 * is from today. */
export function formatInboxTime(iso: string, now: string): string {
  return messageDayKey(iso) === messageDayKey(now) ? formatMessageClock(iso) : formatMessageDay(iso, now);
}

/** Initials for an avatar: first name and surname, so Mohit Kumar is MK.
 * One name gives one letter; a conversation with no name at all (a number
 * that is not a contact) gives nothing and the caller draws a glyph.
 *
 * Digits are not initials. A number passed in here used to come back as
 * "99", which looks like a name and is not one. */
export function nameInitials(name: string | null | undefined): string {
  const words = (name || "")
    .replace(/[^\p{L}\s'-]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0].slice(0, 1) + words[words.length - 1].slice(0, 1)).toUpperCase();
}
