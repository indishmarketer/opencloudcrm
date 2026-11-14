import type { CSSProperties } from "react";

/** A colour field's value: either a plain hex colour, or a gradient.
 *
 * Gradients are stored as a strict token -- `linear:<angle>:<from>:<via>:<to>`
 * -- rather than as raw CSS. A colour field is written by an owner and by
 * MCP, and these values land in inline styles, so accepting arbitrary CSS
 * here would be accepting arbitrary CSS into every page. Parsing a fixed
 * shape and re-emitting the CSS ourselves keeps that closed, and keeps the
 * value small enough to live in the same string column every colour already
 * uses -- no schema change, and an old solid colour is still just "#aabbcc".
 *
 * No React/DOM imports beyond the style type: safe in client components and
 * plain node tests. */

export const HEX_RE = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/;

export type GradientValue = { angle: number; from: string; via: string; to: string };

const GRADIENT_RE =
  /^linear:(\d{1,3}):(#[0-9a-fA-F]{3,8}):(#[0-9a-fA-F]{3,8}):(#[0-9a-fA-F]{3,8})$/;

export function isGradient(value: unknown): boolean {
  return typeof value === "string" && GRADIENT_RE.test(value.trim());
}

export function parseGradient(value: unknown): GradientValue | null {
  if (typeof value !== "string") return null;
  const m = GRADIENT_RE.exec(value.trim());
  if (!m) return null;
  const angle = Number(m[1]);
  if (!Number.isFinite(angle) || angle > 360) return null;
  return { angle, from: m[2], via: m[3], to: m[4] };
}

export function formatGradient(g: GradientValue): string {
  const angle = Math.max(0, Math.min(360, Math.round(g.angle)));
  return `linear:${angle}:${g.from}:${g.via}:${g.to}`;
}

export const DEFAULT_GRADIENT: GradientValue = {
  angle: 160,
  from: "#7933e0",
  via: "#a855f7",
  to: "#efe6ff",
};

/** Keeps a colour field's stored value to one of the two valid shapes. */
export function normalizeColorValue(value: unknown, fallback: unknown = ""): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (HEX_RE.test(v) || isGradient(v)) return v;
  const f = typeof fallback === "string" ? fallback.trim() : "";
  return HEX_RE.test(f) || isGradient(f) ? f : "";
}

/** The CSS a gradient token becomes. */
export function gradientCss(value: string): string | null {
  const g = parseGradient(value);
  return g ? `linear-gradient(${g.angle}deg, ${g.from} 0%, ${g.via} 55%, ${g.to} 100%)` : null;
}

/** Styles that paint a surface with either a solid colour or a gradient.
 * A gradient has to go on `background`, not `background-color`, which is why
 * every call site goes through this instead of assigning backgroundColor. */
export function surfaceStyle(value: unknown): CSSProperties | undefined {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return undefined;
  const css = gradientCss(v);
  if (css) return { backgroundImage: css };
  return HEX_RE.test(v) ? { backgroundColor: v } : undefined;
}

/** Styles that colour text. A gradient is painted behind the glyphs and
 * clipped to them, which is the only way CSS gives a gradient to text. */
export function textColorStyle(value: unknown): CSSProperties | undefined {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return undefined;
  const css = gradientCss(v);
  if (css) {
    return {
      backgroundImage: css,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
    } as CSSProperties;
  }
  return HEX_RE.test(v) ? { color: v } : undefined;
}

/** A single representative colour, for somewhere a gradient cannot apply --
 * a border, or an SVG stroke. Takes the gradient's middle stop. */
export function solidColorOf(value: unknown): string {
  const v = typeof value === "string" ? value.trim() : "";
  const g = parseGradient(v);
  if (g) return g.via;
  return HEX_RE.test(v) ? v : "";
}

/** True when a colour reads as dark -- relative luminance (the same
 * weighting the WCAG contrast formula uses: green reads brighter to the
 * eye than red or blue at the same numeric value) below 0.5. A gradient
 * resolves to its middle stop first (solidColorOf); anything that isn't a
 * real hex colour (blank, a CSS variable, garbage) returns `fallbackDark`
 * unchanged rather than guessing.
 *
 * Used wherever a widget we don't fully control the markup of (Turnstile's
 * own "Verified" text, for one) needs to know whether it's sitting on a
 * light or dark surface, since it can't just inherit `color` from its
 * container the way ordinary text does. */
export function isColorDark(value: unknown, fallbackDark = false): boolean {
  const hex = solidColorOf(value);
  if (!HEX_RE.test(hex)) return fallbackDark;
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split("").map((c) => c + c).join("");
  else h = h.slice(0, 6);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 0.5;
}
