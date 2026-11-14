import type { FieldDef, PageBlock } from "@/lib/pageBlocks";

/** Per-device styling.
 *
 * A block's props hold the desktop design. A `mobile` object beside them
 * holds only the values that were deliberately changed while in mobile
 * preview -- nothing else. That asymmetry is the whole point:
 *
 *  - Editing on desktop changes the base value, so it shows up on mobile
 *    too, EXCEPT where mobile has its own override for that exact key.
 *  - Editing in mobile preview writes only into `mobile`, so desktop is
 *    untouched.
 *
 * Inline styles cannot carry a media query, so a block with overrides gets
 * a generated class and a scoped <style> rule instead -- see
 * mobileOverrideCss. The breakpoint matches Tailwind's `md`, which is what
 * the rest of the page already switches on.
 *
 * Only style fields can be overridden. Content (the words, the link, which
 * form) is the same on both devices by design: two devices showing
 * different copy is a content-management problem, not a layout one. */

export const MOBILE_BREAKPOINT_PX = 767;

/** The style keys a mobile override may carry: every RICH_STYLE_FIELDS key
 * except `anchor`, which identifies the section rather than styling it.
 *
 * Listed here rather than derived from RICH_STYLE_FIELDS because pageBlocks
 * imports this module, and reading that array at module top level across a
 * circular import would see it undefined. A test asserts the two lists stay
 * in step, so adding a style field and forgetting this cannot go unnoticed
 * -- the same drift that once left element types out of the palette. */
export const MOBILE_OVERRIDABLE_KEYS = [
  "paddingY",
  "paddingX",
  "marginTop",
  "marginBottom",
  "borderRadius",
  "maxWidth",
  "backgroundColor",
  "textAlign",
  "fontSize",
  "fontWeight",
  "textColor",
] as const;

const OVERRIDABLE = new Set<string>(MOBILE_OVERRIDABLE_KEYS);

export function isOverridableStyleField(field: FieldDef): boolean {
  return OVERRIDABLE.has(field.key);
}

export function mobileOverridesOf(props: Record<string, unknown>): Record<string, unknown> {
  const raw = props.mobile;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/** Keeps only recognised style keys, so a stray content key can never ride
 * in through the mobile bag and change what the page says on a phone. */
export function normalizeMobileOverrides(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (OVERRIDABLE.has(key) && value !== undefined && value !== null && value !== "") out[key] = value;
  }
  return out;
}

/** The props a device actually renders with: the base design, with mobile's
 * own values laid over it. */
export function propsForDevice(
  props: Record<string, unknown>,
  device: "desktop" | "mobile",
): Record<string, unknown> {
  if (device === "desktop") return props;
  return { ...props, ...mobileOverridesOf(props) };
}

/** A stable class name for one block's mobile rule. */
export function mobileClassFor(blockId: string): string {
  return `pm-${blockId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

const CSS_PROPERTY: Record<string, (value: unknown) => string | null> = {
  paddingY: (v) => (typeof v === "number" ? `padding-top:${v}px;padding-bottom:${v}px` : null),
  paddingX: (v) => (typeof v === "number" ? `padding-left:${v}px;padding-right:${v}px` : null),
  marginTop: (v) => (typeof v === "number" ? `margin-top:${v}px` : null),
  marginBottom: (v) => (typeof v === "number" ? `margin-bottom:${v}px` : null),
  borderRadius: (v) => (typeof v === "number" ? `border-radius:${v}px` : null),
  maxWidth: (v) => (typeof v === "number" && v > 0 ? `max-width:${v}px` : null),
  fontSize: (v) => (typeof v === "number" ? `font-size:${v}px` : null),
  textAlign: (v) => (typeof v === "string" ? `text-align:${v}` : null),
  fontWeight: (v) => {
    const weights: Record<string, string> = { normal: "400", medium: "500", semibold: "600", bold: "700" };
    return typeof v === "string" && weights[v] ? `font-weight:${weights[v]}` : null;
  },
  // Missing before -- a mobile override for this key produced no CSS at
  // all, silently. Solid colours only; a gradient text colour (see
  // src/lib/colorValue.ts) still isn't overridable per-device.
  textColor: (v) => (typeof v === "string" && v ? `color:${v}` : null),
};

/** Which selector a property's override rule needs, because of WHERE each
 * styleModel:"rich" block (richBoxStyle/richTextStyle in blockViews.tsx)
 * actually puts that inline style -- not always the same element
 * `mobileClass` is on:
 *
 *  - "self": backgroundColor, paddingY, marginTop/Bottom, borderRadius sit
 *    directly on the block's own outer wrapper (RichSection/Section), the
 *    same element that carries the generated class. A plain `.pm-x` rule
 *    reaches them.
 *  - "child": maxWidth and paddingX sit on RichSection's one inner content
 *    div, not the outer wrapper itself -- `.pm-x` alone never matched them,
 *    so the override silently did nothing. `.pm-x > div` reaches that one
 *    specific child without touching anything deeper.
 *  - "descendant": textAlign, fontSize, fontWeight and textColor are
 *    text-level properties each block applies on whichever element
 *    actually holds its text (richTextStyle), which can be nested two or
 *    more levels inside the wrapper (e.g. RichTextBlock's own
 *    ".page-richtext" div). These are also CSS-inherited properties, so a
 *    wildcard descendant selector is both necessary (nothing shallower
 *    reaches every block type's own markup) and safe (an inline element
 *    like <a>/<strong> either ignores text-align or would inherit the
 *    same value anyway) -- the one exception is deliberately-formatted
 *    rich text (a hand-coloured or hand-bolded word) nested inside a Text
 *    element that also carries a mobile font-weight/colour override,
 *    which this would now also re-paint; accepted, since the alternative
 *    is the override doing nothing at all. */
const SELECTOR_SCOPE: Record<string, "self" | "child" | "descendant"> = {
  backgroundColor: "self",
  paddingY: "self",
  marginTop: "self",
  marginBottom: "self",
  borderRadius: "self",
  maxWidth: "child",
  paddingX: "child",
  textAlign: "descendant",
  fontSize: "descendant",
  fontWeight: "descendant",
  textColor: "descendant",
};

/** The <style> body for every block that has mobile overrides. Returns ""
 * when nothing on the page overrides anything, so an ordinary page emits no
 * extra markup at all. */
export function mobileOverrideCss(blocks: PageBlock[]): string {
  const rules: string[] = [];

  const walk = (list: PageBlock[]) => {
    for (const block of list) {
      const overrides = mobileOverridesOf(block.props as Record<string, unknown>);
      const byScope: Record<"self" | "child" | "descendant", string[]> = { self: [], child: [], descendant: [] };
      for (const [key, value] of Object.entries(overrides)) {
        const declaration = CSS_PROPERTY[key]?.(value);
        if (!declaration) continue;
        const scope = SELECTOR_SCOPE[key] ?? "self";
        // !important because the same values are also written as inline
        // styles for desktop, and an inline style outranks any class.
        byScope[scope].push(...declaration.split(";").map((p) => `${p} !important`));
      }
      const cls = mobileClassFor(block.id);
      if (byScope.self.length) rules.push(`.${cls}{${byScope.self.join(";")}}`);
      if (byScope.child.length) rules.push(`.${cls}>div{${byScope.child.join(";")}}`);
      if (byScope.descendant.length) rules.push(`.${cls},.${cls} *{${byScope.descendant.join(";")}}`);

      const items = (block.props as { items?: unknown }).items;
      if (Array.isArray(items)) {
        for (const column of items) if (Array.isArray(column)) walk(column as PageBlock[]);
      }
    }
  };
  walk(blocks);

  return rules.length ? `@media (max-width:${MOBILE_BREAKPOINT_PX}px){${rules.join("")}}` : "";
}
