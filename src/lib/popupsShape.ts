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
};

export const DEFAULT_POPUP_SETTINGS: PopupSettings = {
  maxWidth: 480,
  padding: 32,
  borderRadius: 16,
  backgroundColor: "",
  overlayOpacity: 60,
  ariaLabel: "",
};

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
  };
}

export function normalizePopupName(input: unknown): string {
  return str(input, MAX_POPUP_NAME) || "Untitled popup";
}
