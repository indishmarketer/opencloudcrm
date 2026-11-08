/** The site's color palette and the two sitewide gradients (the dark/light
 * band backgrounds used behind hero-style sections). Edited from Console
 * -> Site Settings -> Theme, stored as one JSON value in site_settings
 * (key SITE_THEME_KEY), and read live on every request -- unlike the
 * NEXT_PUBLIC_COLOR_* env vars this replaces, a change here takes effect
 * immediately with no rebuild or redeploy.
 *
 * Every default below is the exact value src/app/globals.css and the old
 * COLOR_INK/COLOR_PAPER/etc env vars already shipped, so an unconfigured
 * install (including every existing deployment before this feature
 * shipped) looks pixel-identical until someone actually opens the Theme
 * tab and changes something.
 *
 * No imports on purpose: safe for client components and plain node tests.
 * The DB read/write lives in src/lib/siteTheme.ts. */

export const SITE_THEME_KEY = "site_theme";

export type Gradient = { from: string; via: string; to: string; angle: number };

export type SiteTheme = {
  ink: string;
  paper: string;
  paperSoft: string;
  inkSoft: string;
  line: string;
  inkGradient: Gradient;
  paperGradient: Gradient;
};

export const DEFAULT_SITE_THEME: SiteTheme = {
  ink: "#0a0a0a",
  paper: "#ffffff",
  paperSoft: "#f5f5f4",
  inkSoft: "#4b4b4b",
  line: "#e2e2e0",
  inkGradient: { from: "#0a0a0a", via: "#262626", to: "#0a0a0a", angle: 160 },
  paperGradient: { from: "#ffffff", via: "#f5f5f4", to: "#ececea", angle: 160 },
};

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/;

function hex(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR_RE.test(value) ? value : fallback;
}

function angle(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(360, Math.round(n))) : fallback;
}

function normalizeGradient(raw: unknown, fallback: Gradient): Gradient {
  const g = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    from: hex(g.from, fallback.from),
    via: hex(g.via, fallback.via),
    to: hex(g.to, fallback.to),
    angle: angle(g.angle, fallback.angle),
  };
}

export function normalizeSiteTheme(input: unknown, fallback: SiteTheme = DEFAULT_SITE_THEME): SiteTheme {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    ink: hex(raw.ink, fallback.ink),
    paper: hex(raw.paper, fallback.paper),
    paperSoft: hex(raw.paperSoft, fallback.paperSoft),
    inkSoft: hex(raw.inkSoft, fallback.inkSoft),
    line: hex(raw.line, fallback.line),
    inkGradient: normalizeGradient(raw.inkGradient, fallback.inkGradient),
    paperGradient: normalizeGradient(raw.paperGradient, fallback.paperGradient),
  };
}

export function gradientCss(g: Gradient): string {
  return `linear-gradient(${g.angle}deg, ${g.from} 0%, ${g.via} 55%, ${g.to} 100%)`;
}

/** The inline <style> block the root layout renders on every page --
 * overrides globals.css's static :root defaults and the two gradient
 * utility classes with this deployment's live theme. */
export function siteThemeCss(theme: SiteTheme): string {
  return `:root { --ink: ${theme.ink}; --paper: ${theme.paper}; --paper-soft: ${theme.paperSoft}; --ink-soft: ${theme.inkSoft}; --line: ${theme.line}; } .bg-ink-gradient { background: ${gradientCss(theme.inkGradient)}; } .bg-paper-gradient { background: ${gradientCss(theme.paperGradient)}; }`;
}
