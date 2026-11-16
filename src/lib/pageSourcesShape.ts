/** A contact source label: what the owner calls the place a contact came
 * from, written by them (never generated). At most three words.
 * No imports: safe for client components. */
export const MAX_SOURCE_WORDS = 3;
export const MAX_SOURCE_LENGTH = 40;

/** Where the one meeting-booking source is kept (Meetings → Source); it
 * applies to every meeting type's booking page under /book. */
export const MEETING_SOURCE_PATH = "/book";
/** The fixed source of anyone who creates an account, however they sign up. */
export const ACCOUNT_SOURCE_LABEL = "Account";

/** The cleaned label, "" for none, or null when it is too long. */
export function cleanSourceLabel(input: unknown): string | null {
  const label = typeof input === "string" ? input.trim().replace(/\s+/g, " ") : "";
  if (!label) return "";
  if (label.split(" ").length > MAX_SOURCE_WORDS || label.length > MAX_SOURCE_LENGTH) return null;
  return label;
}

/** The path part of a page address or full URL ("/blog/x"), or null. */
export function sourcePath(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const url = new URL(input, "http://local");
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
    return path.startsWith("/") ? path.slice(0, 300) : null;
  } catch {
    return null;
  }
}
