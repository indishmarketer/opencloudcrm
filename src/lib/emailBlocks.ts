/** The email builder's element library: every block type an email can
 * hold, the fields each one has, and the code that turns untrusted input
 * (a console save, an API call) into a clean block.
 *
 * Deliberately parallel to src/lib/pageBlocks.ts in shape (same `FieldDef`/
 * `FieldKind` types, reused directly so the console's existing generic
 * FieldGroup/FieldInput form-renderer needs zero new code) but NOT sharing
 * its renderer: a page targets the web DOM with Tailwind; an email has to
 * render as `<table>`/`<tr>`/`<td>` with inline styles only, since that is
 * the only layout mail clients (Outlook above all) reliably support. See
 * src/lib/emailBlocksRender.ts for the HTML this schema actually produces.
 *
 * No server-only imports: shared by the console's client components and
 * plain node tests, same discipline as pageBlocks.ts. */

import type { FieldDef } from "@/lib/pageBlocks";

export type EmailBlock = { id: string; type: string; props: Record<string, unknown> };

export type EmailBlockDef = {
  type: string;
  label: string;
  description: string;
  /** Content: what this block says. Style: how it looks. Split the same
   * way the console's right-hand panel already expects two groups. */
  fields: FieldDef[];
  styleFields: FieldDef[];
  defaults: Record<string, unknown>;
};

const text = (key: string, label: string, extra: { max?: number; placeholder?: string; help?: string } = {}): FieldDef => ({
  key,
  label,
  kind: "text",
  ...extra,
});
const textarea = (key: string, label: string, extra: { max?: number; placeholder?: string; help?: string } = {}): FieldDef => ({
  key,
  label,
  kind: "textarea",
  ...extra,
});
const link = (key: string, label: string, help?: string): FieldDef => ({
  key,
  label,
  kind: "link",
  help: help ?? "A full https:// link -- a relative path won't resolve once this leaves your own site, inside an email.",
  placeholder: "https://...",
});
const image = (key: string, label: string): FieldDef => ({ key, label, kind: "image" });
const color = (key: string, label: string, help?: string): FieldDef => ({ key, label, kind: "color", help });
const toggle = (key: string, label: string, help?: string): FieldDef => ({ key, label, kind: "toggle", help });
const select = (key: string, label: string, options: [string, string][], help?: string): FieldDef => ({
  key,
  label,
  kind: "select",
  help,
  options: options.map(([value, optionLabel]) => ({ value, label: optionLabel })),
});
const dimension = (key: string, label: string, max: number, help?: string): FieldDef => ({
  key,
  label,
  kind: "number",
  min: 0,
  max,
  help,
});

/** Every block gets these -- the handful of inline-style properties that
 * actually work the same across mail clients (unlike a page section,
 * there is no border-radius-on-everything/box-shadow/gradient confidence
 * here: Outlook's Word rendering engine ignores most of that). */
const COMMON_STYLE_FIELDS: FieldDef[] = [
  color("backgroundColor", "Background colour"),
  dimension("paddingY", "Padding, top/bottom (px)", 120),
  dimension("paddingX", "Padding, left/right (px)", 120),
  select("align", "Alignment", [["left", "Left"], ["center", "Center"], ["right", "Right"]]),
];
const COMMON_STYLE_DEFAULTS = { backgroundColor: "", paddingY: 12, paddingX: 24, align: "left" };

const TEXT_STYLE_FIELDS: FieldDef[] = [
  color("textColor", "Text colour"),
  dimension("fontSize", "Text size (px)", 72),
  select("fontWeight", "Text weight", [["normal", "Normal"], ["bold", "Bold"]]),
];
const TEXT_STYLE_DEFAULTS = { textColor: "", fontSize: 16, fontWeight: "normal" };

export const EMAIL_BLOCK_DEFS: EmailBlockDef[] = [
  {
    type: "heading",
    label: "Heading",
    description: "A title or section header.",
    fields: [text("text", "Heading", { max: 200 })],
    styleFields: [...COMMON_STYLE_FIELDS, ...TEXT_STYLE_FIELDS],
    defaults: { text: "Heading", ...COMMON_STYLE_DEFAULTS, ...TEXT_STYLE_DEFAULTS, fontSize: 24, fontWeight: "bold" },
  },
  {
    type: "text",
    label: "Text",
    description: "A paragraph. Bold, italic, links and colour only -- no tables or embeds, which mail clients don't render reliably anyway.",
    fields: [textarea("html", "Text", { max: 4000 })],
    styleFields: [...COMMON_STYLE_FIELDS, ...TEXT_STYLE_FIELDS],
    defaults: { html: "<p>Write something here.</p>", ...COMMON_STYLE_DEFAULTS, ...TEXT_STYLE_DEFAULTS },
  },
  {
    type: "image",
    label: "Image",
    description: "A picture, at its own real size.",
    fields: [image("src", "Image"), text("alt", "Alt text", { max: 200 }), link("href", "Link (optional)")],
    styleFields: [...COMMON_STYLE_FIELDS, dimension("width", "Width (px, blank = natural size)", 600)],
    defaults: { src: "", alt: "", href: "", ...COMMON_STYLE_DEFAULTS, width: 0 },
  },
  {
    type: "button",
    label: "Button",
    description: "One call-to-action button.",
    fields: [text("label", "Button text", { max: 60 }), link("href", "Link")],
    styleFields: [
      ...COMMON_STYLE_FIELDS,
      color("buttonColor", "Button colour"),
      color("buttonTextColor", "Button text colour"),
      dimension("borderRadius", "Corner roundness (px)", 40),
    ],
    defaults: { label: "Click here", href: "", ...COMMON_STYLE_DEFAULTS, buttonColor: "#0a0a0a", buttonTextColor: "#ffffff", borderRadius: 6 },
  },
  {
    type: "divider",
    label: "Divider",
    description: "A horizontal line to separate sections.",
    fields: [],
    styleFields: [...COMMON_STYLE_FIELDS, color("lineColor", "Line colour")],
    defaults: { ...COMMON_STYLE_DEFAULTS, lineColor: "#e2e2e0" },
  },
  {
    type: "spacer",
    label: "Spacer",
    description: "Blank vertical space.",
    fields: [],
    styleFields: [dimension("height", "Height (px)", 200)],
    defaults: { height: 24 },
  },
  {
    type: "columns",
    label: "Columns",
    description: "Two columns side by side (stacks on narrow screens, same as every other side-by-side layout in email).",
    fields: [textarea("leftHtml", "Left column text", { max: 2000 }), textarea("rightHtml", "Right column text", { max: 2000 })],
    styleFields: [...COMMON_STYLE_FIELDS, ...TEXT_STYLE_FIELDS],
    defaults: { leftHtml: "<p>Left</p>", rightHtml: "<p>Right</p>", ...COMMON_STYLE_DEFAULTS, ...TEXT_STYLE_DEFAULTS },
  },
  {
    type: "socialIcons",
    label: "Social icons",
    description: "Links to your social profiles.",
    fields: [
      link("facebook", "Facebook URL (blank to hide)"),
      link("x", "X / Twitter URL (blank to hide)"),
      link("instagram", "Instagram URL (blank to hide)"),
      link("linkedin", "LinkedIn URL (blank to hide)"),
    ],
    styleFields: [...COMMON_STYLE_FIELDS, color("iconColor", "Icon colour")],
    defaults: { facebook: "", x: "", instagram: "", linkedin: "", ...COMMON_STYLE_DEFAULTS, align: "center", iconColor: "#6b6b6b" },
  },
  {
    type: "footer",
    label: "Footer",
    description:
      "Preview of the footer every email already gets (your business name/address and an unsubscribe link) -- its text is automatic, but its colours here are real and apply to the actual sent email. The unsubscribe link itself can't be removed or restyled away, by law.",
    fields: [toggle("showSocialIcons", "Show social icons in the footer", "Uses the links set in the Social icons block above, if one is on this email.")],
    styleFields: [color("textColor", "Footer text colour"), color("linkColor", "Footer link colour (the Unsubscribe link)")],
    defaults: { showSocialIcons: false, textColor: "#6b6b6b", linkColor: "#dc2626" },
  },
];

export function getEmailBlockDef(type: string): EmailBlockDef | undefined {
  return EMAIL_BLOCK_DEFS.find((d) => d.type === type);
}

export function emailBlockFields(def: EmailBlockDef): FieldDef[] {
  return def.fields;
}

export function emailStyleFields(def: EmailBlockDef): FieldDef[] {
  return def.styleFields;
}

export function newEmailBlockId(): string {
  return `eb_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/** A fresh block of `type` with its default props -- every field gets a
 * real value (not undefined), same reasoning as pageBlocks.ts's
 * createBlock: a block with holes forces every renderer and every style
 * helper to re-derive its own "what if this is missing" fallback. */
export function createEmailBlock(type: string): EmailBlock {
  const def = getEmailBlockDef(type);
  if (!def) throw new Error(`Unknown email block type "${type}".`);
  return { id: newEmailBlockId(), type, props: { ...def.defaults } };
}

const MAX_EMAIL_BLOCKS = 60;

/** Keeps only recognised block types and recognised keys within them, so a
 * stray/forged key can never ride an email's stored blocks into the
 * rendered HTML (the renderer only ever reads named props, but this is
 * the single place that validates what's allowed to be there at all,
 * matching normalizeFormElements's reasoning in formsShape.ts). */
export function normalizeEmailBlocks(raw: unknown): EmailBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_EMAIL_BLOCKS)
    .map((item): EmailBlock | null => {
      const obj = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const def = getEmailBlockDef(typeof obj.type === "string" ? obj.type : "");
      if (!def) return null;
      const id = typeof obj.id === "string" && obj.id ? obj.id : newEmailBlockId();
      const rawProps = obj.props && typeof obj.props === "object" ? (obj.props as Record<string, unknown>) : {};
      const allowedKeys = new Set([...def.fields, ...def.styleFields].map((f) => f.key));
      const props: Record<string, unknown> = { ...def.defaults };
      for (const [key, value] of Object.entries(rawProps)) {
        if (allowedKeys.has(key) && value !== undefined) props[key] = value;
      }
      return { id, type: def.type, props };
    })
    .filter((b): b is EmailBlock => b !== null);
}
