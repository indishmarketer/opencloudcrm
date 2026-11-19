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

/** Production contact sources are code-owned. A path always resolves to the
 * same short label, so attribution no longer depends on a console field or
 * a row existing in page_sources. */
/** A readable label for a page that matches no known section, built from its
 * first path segment ("/free-guide/x" -> "Free guide"). Capped at
 * MAX_SOURCE_WORDS so the result always survives cleanSourceLabel -- a label
 * over three words is rejected outright, which would drop the source and put
 * the contact back to "Unknown". */
function labelFromPath(path: string): string {
  const segment = path.split("/").filter(Boolean)[0] || "";
  const words = segment.replace(/[-_]+/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, MAX_SOURCE_WORDS);
  const text = words.join(" ").slice(0, MAX_SOURCE_LENGTH).trim();
  if (!text) return HOME_SOURCE_LABEL;
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/** The home page, named as a page. Never "Website": a source has to say
 * which page someone came from, and "Website" is the one answer that says
 * nothing -- it was also the silent fallback for an uncaptured path, so a
 * missing source and a genuine home-page signup were indistinguishable. */
export const HOME_SOURCE_LABEL = "Home page";

export function hardcodedPageSource(input: string | null | undefined): string {
  const path = sourcePath(input) || "/";
  if (path === "/") return HOME_SOURCE_LABEL;
  if (/^\/blog(?:\/|$)/.test(path)) return "Blog";
  if (/^\/courses?(?:\/|$)/.test(path)) return "Course";
  if (/^\/webinars?(?:\/|$)/.test(path)) return "Webinar";
  if (/^\/book(?:\/|$)/.test(path)) return "Meeting booking";
  if (/^\/newsletter(?:\/|$)/.test(path)) return "Newsletter";
  if (/^\/contact(?:\/|$)/.test(path)) return "Contact page";
  if (/^\/(?:guide|guides|resources)(?:\/|$)/.test(path)) return "Free guide";
  if (/^\/(?:directory|tools)(?:\/|$)/.test(path)) return "Tools directory";
  if (/^\/community(?:\/|$)/.test(path)) return "Community";
  if (/^\/reviews?(?:\/|$)/.test(path)) return "Reviews";
  if (/^\/(?:signup|auth)(?:\/|$)/.test(path)) return ACCOUNT_SOURCE_LABEL;
  return labelFromPath(path);
}

export const HARDCODED_PAGE_SOURCES = [
  { path: "/", label: HOME_SOURCE_LABEL },
  { path: "/blog", label: "Blog" },
  { path: "/courses", label: "Course" },
  { path: "/webinars", label: "Webinar" },
  { path: MEETING_SOURCE_PATH, label: "Meeting booking" },
  { path: "/newsletter", label: "Newsletter" },
  { path: "/contact", label: "Contact page" },
  { path: "/resources", label: "Free guide" },
  { path: "/directory", label: "Tools directory" },
  { path: "/community", label: "Community" },
  { path: "/reviews", label: "Reviews" },
] as const;

/** Canonical public path for a code-owned source label. This is only the
 * section fallback; when the visitor's exact path is known we store that
 * exact path instead (for example /blog/a-specific-post). */
export function hardcodedSourcePathForLabel(input: string | null | undefined): string | null {
  const label = String(input || "").trim().toLowerCase();
  if (!label) return null;
  if (label === "account" || label === "account signup") return "/signup";
  return HARDCODED_PAGE_SOURCES.find((source) => source.label.toLowerCase() === label)?.path || null;
}

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
