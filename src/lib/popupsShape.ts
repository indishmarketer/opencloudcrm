/** A popup an owner designs in Console → Popups, opened by a button on any
 * page. Its contents are ordinary page elements, so the whole element
 * palette, the style system and the renderer apply unchanged -- see the
 * note in migration 183 for why it reuses `blocks` rather than inventing a
 * popup-only element format.
 *
 * No imports beyond the block types on purpose: safe for client components
 * and plain node tests. The DB read/write lives in src/lib/popups.ts. */

export type PopupSettings = {
  /** Dialog width in px. */
  maxWidth: number;
  padding: number;
  borderRadius: number;
  backgroundColor: string;
  /** 0-100: how dark the page behind the popup goes. */
  overlayOpacity: number;
  /** Shown as the dialog's accessible name when no heading is present. */
  ariaLabel: string;
  /** Opens by itself (besides any button or link that opens it). */
  autoOpen: boolean;
  /** Seconds after the page loads. */
  delaySeconds: number;
  /** Also open when the cursor heads out of the window (desktop). */
  exitIntent: boolean;
  /** Where it opens by itself. */
  showOn: PopupShowOn;
  /** For showOn "pages": paths like /newsletter, or /blog/* for a whole section. */
  paths: string[];
  audience: PopupAudience;
  /** How often one visitor sees it open by itself. */
  frequency: PopupFrequency;
};

export const POPUP_SHOW_ON = [
  { value: "everywhere", label: "Every page" },
  { value: "blog_posts", label: "All blog posts" },
  { value: "pages", label: "Only these pages" },
] as const;
export type PopupShowOn = (typeof POPUP_SHOW_ON)[number]["value"];
export const POPUP_AUDIENCE = [
  { value: "logged_out", label: "Only visitors who aren't logged in" },
  { value: "everyone", label: "Everyone" },
] as const;
export type PopupAudience = (typeof POPUP_AUDIENCE)[number]["value"];
export const POPUP_FREQUENCY = [
  { value: "session", label: "Once per visit" },
  { value: "day", label: "Once a day" },
  { value: "week", label: "Once a week" },
  { value: "once", label: "Only once, ever" },
] as const;
export type PopupFrequency = (typeof POPUP_FREQUENCY)[number]["value"];

/** Whether a popup set to open by itself belongs on this path. Never on
 * console or account pages. */
export function popupMatchesPath(settings: PopupSettings, pathname: string): boolean {
  if (/^\/(console|account|login|signup)(\/|$)/.test(pathname)) return false;
  if (settings.showOn === "everywhere") return true;
  if (settings.showOn === "blog_posts") return /^\/blog\/[^/]+\/?$/.test(pathname) && !pathname.startsWith("/blog/preview");
  const trim = (value: string) => (value.length > 1 ? value.replace(/\/$/, "") : value);
  return settings.paths.some((path) => path.endsWith("/*")
    ? pathname === path.slice(0, -2) || pathname.startsWith(path.slice(0, -1))
    : trim(pathname) === trim(path));
}

export const DEFAULT_POPUP_SETTINGS: PopupSettings = {
  maxWidth: 480,
  padding: 32,
  borderRadius: 16,
  backgroundColor: "",
  overlayOpacity: 60,
  ariaLabel: "",
  autoOpen: false,
  delaySeconds: 5,
  exitIntent: true,
  showOn: "blog_posts",
  paths: [],
  audience: "logged_out",
  frequency: "session",
};

function pick<T extends string>(value: unknown, allowed: readonly { value: T }[], fallback: T): T {
  return allowed.some((item) => item.value === value) ? (value as T) : fallback;
}

export const MAX_POPUP_NAME = 100;

function int(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

function str(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export function normalizePopupSettings(input: unknown): PopupSettings {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  return {
    maxWidth: int(raw.maxWidth, DEFAULT_POPUP_SETTINGS.maxWidth, 240, 1200),
    padding: int(raw.padding, DEFAULT_POPUP_SETTINGS.padding, 0, 120),
    borderRadius: int(raw.borderRadius, DEFAULT_POPUP_SETTINGS.borderRadius, 0, 64),
    backgroundColor: str(raw.backgroundColor, 120),
    overlayOpacity: int(raw.overlayOpacity, DEFAULT_POPUP_SETTINGS.overlayOpacity, 0, 100),
    ariaLabel: str(raw.ariaLabel, 120),
    autoOpen: raw.autoOpen === true,
    delaySeconds: int(raw.delaySeconds, DEFAULT_POPUP_SETTINGS.delaySeconds, 0, 300),
    exitIntent: raw.exitIntent === undefined ? DEFAULT_POPUP_SETTINGS.exitIntent : raw.exitIntent === true,
    showOn: pick(raw.showOn, POPUP_SHOW_ON, DEFAULT_POPUP_SETTINGS.showOn),
    paths: Array.isArray(raw.paths)
      ? raw.paths.filter((path): path is string => typeof path === "string").map((path) => path.trim()).filter((path) => /^\/[\w\-./*]*$/.test(path)).slice(0, 30)
      : [],
    audience: pick(raw.audience, POPUP_AUDIENCE, DEFAULT_POPUP_SETTINGS.audience),
    frequency: pick(raw.frequency, POPUP_FREQUENCY, DEFAULT_POPUP_SETTINGS.frequency),
  };
}

export function normalizePopupName(input: unknown): string {
  return str(input, MAX_POPUP_NAME) || "Untitled popup";
}
