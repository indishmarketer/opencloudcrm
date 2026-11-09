/** The page builder's section library: every block type a page can hold,
 * the fields each one has, and the code that turns untrusted input (a
 * console save, an API/MCP call, an import file) into a clean block.
 *
 * One registry drives everything -- the console editor builds its forms
 * from `fields`, the API/MCP `list_page_block_types` tool publishes the
 * same definitions, and normalizeBlocks() enforces them on every write --
 * so adding a block type means adding one entry here plus its renderer in
 * src/components/pageBlocks/.
 *
 * No server-only imports: shared by client components and plain node
 * tests. Rich text is sanitized by the server caller (see sanitizeHtml
 * param on normalizeBlocks), since sanitize-html is too heavy to ship to
 * the browser. */

import { safeHref, SOCIAL_PLATFORMS } from "@/lib/siteChromeShape";
import { escapeHtml } from "@/lib/escapeHtml";

export type FieldKind = "text" | "textarea" | "richtext" | "link" | "image" | "select" | "iconPicker" | "number" | "toggle" | "list" | "color" | "code" | "datetime";

type BaseField = { key: string; label: string; help?: string };
export type FieldDef =
  | (BaseField & { kind: "text" | "textarea"; max?: number; placeholder?: string })
  | (BaseField & { kind: "richtext" })
  | (BaseField & { kind: "link" | "image"; placeholder?: string })
  | (BaseField & { kind: "select" | "iconPicker"; options: { value: string; label: string }[] })
  | (BaseField & { kind: "number"; min: number; max: number })
  | (BaseField & { kind: "toggle" })
  | (BaseField & { kind: "list"; itemLabel: string; max: number; fields: FieldDef[] })
  | (BaseField & { kind: "color" })
  | (BaseField & { kind: "code"; max?: number })
  | (BaseField & { kind: "datetime" });

export type BlockCategory = "Headers" | "Content" | "Media" | "Calls to action" | "Live content" | "Forms" | "Business" | "Layout" | "Custom design";

export type BlockDef = {
  type: string;
  label: string;
  description: string;
  category: BlockCategory;
  fields: FieldDef[];
  defaults: Record<string, unknown>;
  /** Only meaningful on built-in pages (courses list, legal pages...):
   * marks where that page's own content renders. Never offered in the
   * "add section" menu and at most one per page. */
  internal?: boolean;
  /** Usable as a child element inside a "row" block's columns, in addition
   * to standing alone as a top-level section. Composite multi-part
   * sections (hero, cards...) are never nestable -- only single-content
   * elements are, matching systeme.io's Section > Row > Column > Element
   * model capped at one level of nesting. */
  nestable?: boolean;
  /** One line for the editor's Add-section menu and section list, where
   * the full `description` (written for an API/MCP client that gets one
   * read and no UI) is a wall of text. Falls back to `description`. */
  summary?: string;
  /** Superseded by a newer block type, but still normalizes/renders so
   * existing pages that already have one keep working. Hidden from "Add
   * section" (new pages can't create more of them) without touching
   * hasSectionFields()/normalizeBlocks() behavior the way `internal` does. */
  deprecated?: boolean;
};

export type PageBlock = { id: string; type: string; props: Record<string, unknown> };

type TextOptions = { max?: number; placeholder?: string; help?: string };
const text = (key: string, label: string, extra: TextOptions = {}): FieldDef => ({ key, label, kind: "text", ...extra });
const textarea = (key: string, label: string, extra: TextOptions = {}): FieldDef => ({ key, label, kind: "textarea", ...extra });
const link = (key: string, label: string, help?: string): FieldDef => ({ key, label, kind: "link", help, placeholder: "/contact or https://..." });
const image = (key: string, label: string): FieldDef => ({ key, label, kind: "image" });
const color = (key: string, label: string, help?: string): FieldDef => ({ key, label, kind: "color", help });
const code = (key: string, label: string, help?: string, max?: number): FieldDef => ({ key, label, kind: "code", help, max });
const datetime = (key: string, label: string, help?: string): FieldDef => ({ key, label, kind: "datetime", help });
const toggle = (key: string, label: string, help?: string): FieldDef => ({ key, label, kind: "toggle", help });
const select = (key: string, label: string, options: [string, string][], help?: string): FieldDef => ({
  key,
  label,
  kind: "select",
  help,
  options: options.map(([value, optionLabel]) => ({ value, label: optionLabel })),
});
/** Same shape as select(), but rendered as a searchable visual grid of
 * glyphs (see IconPickerField in PageBlockFields.tsx) instead of a list of
 * option labels -- for a field whose options are themselves icons, where
 * reading a name next to a dozen others is far slower than recognizing the
 * shape. */
const iconPicker = (key: string, label: string, options: [string, string][], help?: string): FieldDef => ({
  key,
  label,
  kind: "iconPicker",
  help,
  options: options.map(([value, optionLabel]) => ({ value, label: optionLabel })),
});
const count = (key: string, label: string, max = 12): FieldDef => ({ key, label, kind: "number", min: 1, max });

/** Every block gets these, appended after its own fields. */
export const SECTION_FIELDS: FieldDef[] = [
  select("background", "Background", [["default", "Page background"], ["soft", "Soft tint"], ["dark", "Dark"]]),
  select("spacing", "Spacing", [["normal", "Normal"], ["compact", "Compact"], ["none", "None"]]),
  text("anchor", "Anchor id", { help: "Optional. Lets you link to this section with /page#anchor.", max: 60 }),
];
const SECTION_DEFAULTS = { background: "default", spacing: "normal", anchor: "" };

/** Finer manual overrides, appended after SECTION_FIELDS. Every value
 * defaults to "" (inherit/no override) so every existing block and every
 * already-published page renders pixel-identical until someone opens the
 * Style tab and changes one. Enum values map to literal Tailwind classes in
 * the renderer (src/components/pageBlocks/blocks.tsx) -- never assembled
 * into a class name at runtime, since Tailwind only generates classes it
 * can see written literally in source. */
export const STYLE_FIELDS: FieldDef[] = [
  select("paddingY", "Extra vertical padding", [["", "Default"], ["none", "None"], ["sm", "Small"], ["lg", "Large"], ["xl", "Extra large"]]),
  select("paddingX", "Extra horizontal padding", [["", "Default"], ["none", "None"], ["sm", "Small"], ["lg", "Large"]]),
  select("marginTop", "Space above", [["", "Default"], ["none", "None"], ["sm", "Small"], ["lg", "Large"]]),
  select("marginBottom", "Space below", [["", "Default"], ["none", "None"], ["sm", "Small"], ["lg", "Large"]]),
  select("maxWidth", "Content width", [["", "Default"], ["narrow", "Narrow"], ["normal", "Normal"], ["wide", "Wide"], ["full", "Full width"]]),
  select("borderRadius", "Corner roundness", [["", "Default"], ["none", "Square"], ["lg", "Rounded"], ["full", "Pill"]]),
  select("textAlign", "Text alignment", [["", "Default"], ["left", "Left"], ["center", "Center"], ["right", "Right"]], "Applies to simple text/button/heading sections; ignored by multi-part sections like Cards or Hero."),
  select("fontSize", "Text size", [["", "Default"], ["sm", "Small"], ["lg", "Large"], ["xl", "Extra large"], ["2xl", "2x large"], ["3xl", "3x large"]], "Applies to simple text/button/heading sections; ignored by multi-part sections like Cards or Hero."),
  select("fontWeight", "Text weight", [["", "Default"], ["normal", "Normal"], ["medium", "Medium"], ["semibold", "Semibold"], ["bold", "Bold"]], "Applies to simple text/button/heading sections; ignored by multi-part sections like Cards or Hero."),
  color("backgroundColor", "Custom background color", "Overrides Background above. Leave blank to use it instead."),
  color("textColor", "Custom text color", "Applies to simple text/button/heading sections; ignored by multi-part sections like Cards or Hero."),
];
const STYLE_DEFAULTS = Object.fromEntries(STYLE_FIELDS.map((f) => [f.key, ""]));

/** A curated subset of lucide-react's catalog, picked for marketing/CRM
 * pages. Keys here must match exactly the keys of ICON_COMPONENTS in
 * src/components/pageBlocks/blockViews.tsx -- that's where the glyphs
 * actually live; this file only needs the names for the picker options. */
export const ICON_NAMES: [string, string][] = [
  ["star", "Star"],
  ["heart", "Heart"],
  ["zap", "Lightning"],
  ["shield", "Shield"],
  ["rocket", "Rocket"],
  ["mail", "Mail"],
  ["phone", "Phone"],
  ["globe", "Globe"],
  ["arrowRight", "Arrow right"],
  ["thumbsUp", "Thumbs up"],
  ["award", "Award"],
  ["clock", "Clock"],
  ["mapPin", "Location pin"],
  ["users", "Users"],
  ["trendingUp", "Trending up"],
  ["lock", "Lock"],
  ["gift", "Gift"],
  ["sparkles", "Sparkles"],
  ["smile", "Smile"],
  ["messageCircle", "Message"],
  ["calendar", "Calendar"],
  ["download", "Download"],
  ["play", "Play"],
  ["checkCircle", "Check circle"],
  ["target", "Target"],
  ["lightbulb", "Idea"],
  ["package", "Package"],
  ["creditCard", "Credit card"],
  ["bell", "Bell"],
  ["settings", "Settings"],
];

// The "custom" block is a whole hand-designed section, not a pasted embed
// snippet, so its three code fields get their own far larger ceilings -- an
// art-directed section with a real stylesheet runs well past the 20k a
// third-party widget's <script> tag needs.
const CUSTOM_HTML_LIMIT = 200_000;
const CUSTOM_CSS_LIMIT = 100_000;
const CUSTOM_JS_LIMIT = 50_000;

export const BLOCK_DEFS: BlockDef[] = [
  {
    type: "hero",
    label: "Hero",
    description: "Big headline at the top of a page, with buttons and an optional image.",
    category: "Headers",
    fields: [
      text("eyebrow", "Small label above the headline", { max: 80 }),
      text("heading", "Headline", { max: 200 }),
      textarea("text", "Supporting text", { max: 600 }),
      text("primaryLabel", "Main button text", { max: 60 }),
      link("primaryHref", "Main button link"),
      select("primaryAction", "Main button opens", [["link", "The link above"], ["leadMagnet", "The free-guide popup (if a guide is active)"]]),
      text("secondaryLabel", "Second button text", { max: 60 }),
      link("secondaryHref", "Second button link"),
      image("image", "Image"),
      text("imageAlt", "Image description (alt text)", { max: 200 }),
      select("theme", "Style", [["dark", "Dark"], ["light", "Light"]]),
      image("backgroundImage", "Background image (optional, fills the whole section)"),
      color("backgroundColor", "Background color (optional, behind the background image if both are set)"),
    ],
    defaults: {
      eyebrow: "",
      heading: "Your headline goes here",
      text: "",
      primaryLabel: "Get in touch",
      primaryHref: "/contact",
      primaryAction: "link",
      secondaryLabel: "",
      secondaryHref: "",
      image: "",
      imageAlt: "",
      theme: "dark",
      backgroundImage: "",
      backgroundColor: "",
    },
  },
  {
    type: "pageHeader",
    label: "Page title",
    description: "A simple page title with an intro paragraph.",
    category: "Headers",
    fields: [
      text("eyebrow", "Small label above the title", { max: 80 }),
      text("heading", "Title", { max: 200 }),
      textarea("text", "Intro", { max: 800 }),
      select("align", "Alignment", [["left", "Left"], ["center", "Center"]]),
    ],
    defaults: { eyebrow: "", heading: "Page title", text: "", align: "left" },
  },
  {
    type: "richText",
    label: "Text",
    description: "Formatted text: headings, paragraphs, lists, links and images.",
    category: "Content",
    fields: [{ key: "html", label: "Text", kind: "richtext" }, select("width", "Width", [["narrow", "Narrow (easy reading)"], ["wide", "Wide"]])],
    defaults: { html: "<p>Write something here.</p>", width: "narrow" },
    nestable: true,
  },
  {
    type: "heading",
    label: "Headline",
    description: "One standalone heading, e.g. to label a row of columns.",
    category: "Content",
    fields: [text("text", "Heading text", { max: 200 }), select("level", "Size", [["h2", "Large"], ["h3", "Medium"], ["h4", "Small"]])],
    defaults: { text: "A heading", level: "h2" },
    nestable: true,
  },
  {
    type: "button",
    label: "Button",
    description: "One standalone button/link.",
    category: "Calls to action",
    fields: [
      text("label", "Button text", { max: 60 }),
      link("href", "Link"),
      select("style", "Style", [["primary", "Filled"], ["outline", "Outlined"]]),
      select("align", "Alignment", [["left", "Left"], ["center", "Center"], ["right", "Right"]]),
    ],
    defaults: { label: "Click here", href: "/contact", style: "primary", align: "left" },
    nestable: true,
  },
  {
    type: "icon",
    label: "Icon",
    description: "One standalone icon, optionally with a label and link -- e.g. a feature list item or a trust badge.",
    category: "Content",
    fields: [
      iconPicker("icon", "Icon", ICON_NAMES),
      text("label", "Label (optional)", { max: 80 }),
      link("href", "Link (optional)"),
      select("size", "Size", [["sm", "Small"], ["md", "Medium"], ["lg", "Large"]]),
    ],
    defaults: { icon: "star", label: "", href: "", size: "md" },
    nestable: true,
  },
  {
    type: "row",
    label: "Columns",
    description: "A row of 2-4 columns, each holding its own small elements (text, image, video, button, spacer). Build it visually in the canvas, or set props.items to an array of column arrays over the API/MCP.",
    category: "Layout",
    fields: [
      select("columns", "Columns", [["2", "2"], ["3", "3"], ["4", "4"]]),
      select("gap", "Gap between columns", [["sm", "Small"], ["md", "Medium"], ["lg", "Large"]]),
    ],
    defaults: { columns: "2", gap: "md", items: [[], []] },
  },
  {
    type: "cards",
    label: "Cards",
    description: "A grid of cards: services, features, products, links to other pages.",
    category: "Content",
    fields: [
      text("heading", "Section heading", { max: 160 }),
      textarea("text", "Section intro", { max: 600 }),
      select("columns", "Cards per row", [["2", "2"], ["3", "3"], ["4", "4"]]),
      select("style", "Card style", [["outline", "Outlined"], ["image", "Image on top"]]),
      select("density", "Card spacing", [["compact", "Compact"], ["normal", "Normal"], ["spacious", "Spacious"]]),
      {
        key: "items",
        label: "Cards",
        kind: "list",
        itemLabel: "Card",
        max: 12,
        fields: [
          text("eyebrow", "Small label", { max: 60 }),
          text("title", "Title", { max: 120 }),
          textarea("text", "Text", { max: 500 }),
          link("href", "Link (optional)"),
          text("linkLabel", "Link text", { max: 60 }),
          text("badge", "Badge (e.g. Coming soon)", { max: 40 }),
          image("image", "Image"),
          text("imageAlt", "Image description", { max: 200 }),
        ],
      },
    ],
    defaults: {
      heading: "What we offer",
      text: "",
      columns: "3",
      style: "outline",
      density: "normal",
      items: [
        { eyebrow: "", title: "First thing", text: "Describe it in a sentence or two.", href: "", linkLabel: "", badge: "", image: "", imageAlt: "" },
        { eyebrow: "", title: "Second thing", text: "Describe it in a sentence or two.", href: "", linkLabel: "", badge: "", image: "", imageAlt: "" },
        { eyebrow: "", title: "Third thing", text: "Describe it in a sentence or two.", href: "", linkLabel: "", badge: "", image: "", imageAlt: "" },
      ],
    },
  },
  {
    type: "split",
    label: "Text and image",
    description: "Text on one side, an image on the other, with optional tags and a button.",
    category: "Content",
    fields: [
      text("eyebrow", "Small label", { max: 80 }),
      text("heading", "Heading", { max: 200 }),
      { key: "html", label: "Text", kind: "richtext" },
      textarea("tags", "Tags (one per line)", { max: 600 }),
      text("buttonLabel", "Button text", { max: 60 }),
      link("buttonHref", "Button link"),
      image("image", "Image"),
      text("imageAlt", "Image description", { max: 200 }),
      select("imagePosition", "Image side", [["right", "Right"], ["left", "Left"]]),
      select("headingLevel", "Heading size", [["h2", "Section heading"], ["h1", "Page title"]]),
    ],
    defaults: { eyebrow: "", heading: "A heading", html: "<p>Tell your story here.</p>", tags: "", buttonLabel: "", buttonHref: "", image: "", imageAlt: "", imagePosition: "right", headingLevel: "h2" },
  },
  {
    type: "image",
    label: "Image",
    description: "One image, full width or contained, with an optional caption.",
    category: "Media",
    fields: [image("image", "Image"), text("alt", "Image description (alt text)", { max: 200 }), text("caption", "Caption", { max: 200 }), select("size", "Size", [["contained", "Contained"], ["full", "Full width"]])],
    defaults: { image: "", alt: "", caption: "", size: "contained" },
    nestable: true,
  },
  {
    type: "video",
    label: "Video",
    description: "An embedded YouTube or Vimeo video.",
    category: "Media",
    fields: [text("url", "YouTube or Vimeo link", { max: 300, placeholder: "https://www.youtube.com/watch?v=..." }), text("caption", "Caption", { max: 200 })],
    defaults: { url: "", caption: "" },
    nestable: true,
  },
  {
    type: "custom",
    label: "Custom design",
    summary: "Design a section yourself with HTML and CSS.",
    description:
      "ONE BAND of a page, designed by you from nothing: your own HTML, your own real stylesheet, and optional JavaScript. The CSS is scoped to this section alone, so it can restyle anything inside it without touching the rest of the site. Use this -- not the pre-made sections -- whenever the design is meant to be bespoke. " +
      "A page is several of these stacked (a hero band, then a feature band, then a CTA band), not one block holding an entire page: separate blocks can be reordered, restyled and edited one at a time. " +
      "NEVER include <header>, <nav>, <footer>, <main>, <html>, <head>, <body> or <title>, and never draw the site's logo -- the real header, logo, menu and footer are rendered around every page already, so a section carrying its own shows the visitor two of each and forks the navigation. Saves containing those tags are rejected. " +
      "The site's Tailwind utility classes are NOT available here (Tailwind only generates classes written in the app's own source), so write the CSS you need in the css field instead. " +
      "For images, generate_media_image makes one from a prompt and upload_media_image's svg parameter rasterizes SVG you write; inline <svg> in the HTML needs no upload at all. " +
      "Call get_design_system first, for the brand colors, fonts, CSS variables and the rest of the constraints.",
    category: "Custom design",
    fields: [
      code(
        "html",
        "HTML",
        "The section's markup. Server-rendered as written, so it is in the page source for search engines. Class names are yours to choose -- style them in the CSS field below. Tailwind utility classes do not work here.",
        CUSTOM_HTML_LIMIT
      ),
      code(
        "css",
        "CSS",
        "A real stylesheet for this section. Every selector is scoped to this section automatically, so `.card` means `.card inside this section` and a bare `h2` only hits this section's headings -- nothing here can leak out and restyle the rest of the site. @media, @supports and @container work normally. @keyframes and @font-face are hoisted to the top level (they have to be), so give keyframe names a prefix of their own in case another custom section on the page uses the same name. :root, html and body are rewritten to mean this section.",
        CUSTOM_CSS_LIMIT
      ),
      code(
        "js",
        "JavaScript (optional)",
        "Runs once in the browser after this section is in the DOM, with `root` already bound to the section element -- e.g. root.querySelector(\".tab\"). Leave empty for a purely visual section. <script> tags written inside the HTML field run too.",
        CUSTOM_JS_LIMIT
      ),
      select("width", "Width", [["site", "Site content width"], ["wide", "Wide"], ["full", "Full bleed (edge to edge)"]], "Full bleed hands the design the entire viewport width with no padding of ours -- pick it when the HTML owns its own container."),
      toggle("bare", "No vertical padding", "Drops the standard section padding too, so the HTML controls every pixel of its own spacing."),
    ],
    defaults: { html: "", css: "", js: "", width: "site", bare: false },
  },
  {
    // Superseded by "custom", which does everything this did and adds a
    // real scoped stylesheet, full-bleed width, and script tags that
    // actually run. Two near-identical entries in the Add-section menu
    // was a genuine "why are there two of these?" -- so this one is
    // deprecated: still normalizes and renders, so every page that
    // already holds one keeps working untouched, but it is no longer
    // offered for new sections.
    type: "customCode",
    label: "Custom HTML / code (old)",
    description: "Superseded by Custom design, which adds a scoped stylesheet, full-bleed width and working <script> tags. Kept so existing sections keep rendering; use Custom design for anything new.",
    category: "Custom design",
    fields: [code("html", "HTML / embed code", "Pasted exactly as written, unescaped -- treat this like editing the page's source code.")],
    defaults: { html: "" },
    nestable: true,
    deprecated: true,
  },
  {
    type: "cta",
    label: "Call to action",
    description: "A heading with one or two buttons, to end a page or break up a long one.",
    category: "Calls to action",
    fields: [
      text("heading", "Heading", { max: 200 }),
      textarea("text", "Text", { max: 400 }),
      text("buttonLabel", "Button text", { max: 60 }),
      link("buttonHref", "Button link"),
      text("secondaryLabel", "Second button text", { max: 60 }),
      link("secondaryHref", "Second button link"),
      select("style", "Style", [["band", "Full-width band"], ["card", "Dark card"]]),
    ],
    defaults: { heading: "Ready to get started?", text: "", buttonLabel: "Get in touch", buttonHref: "/contact", secondaryLabel: "", secondaryHref: "", style: "band" },
  },
  {
    type: "countdown",
    label: "Countdown timer",
    description: "A ticking countdown to a date and time, for a launch or a limited-time offer.",
    category: "Calls to action",
    fields: [
      text("heading", "Heading", { max: 160 }),
      datetime("target", "Count down to", "In your own local time -- shown correctly to every visitor regardless of their timezone."),
      text("expiredText", "Text shown once the countdown reaches zero", { max: 200 }),
      text("buttonLabel", "Button text (optional)", { max: 60 }),
      link("buttonHref", "Button link (optional)"),
    ],
    defaults: { heading: "", target: "", expiredText: "We're live.", buttonLabel: "", buttonHref: "" },
    nestable: true,
  },
  {
    type: "faq",
    label: "FAQ",
    description: "Questions and answers. Also tells search engines it's an FAQ.",
    category: "Content",
    fields: [
      text("heading", "Heading", { max: 160 }),
      { key: "items", label: "Questions", kind: "list", itemLabel: "Question", max: 30, fields: [text("question", "Question", { max: 250 }), textarea("answer", "Answer", { max: 2000 })] },
    ],
    defaults: { heading: "Frequently asked questions", items: [{ question: "A common question?", answer: "A clear answer." }] },
  },
  {
    type: "stats",
    label: "Numbers",
    description: "A row of big numbers with labels.",
    category: "Content",
    fields: [
      text("heading", "Heading", { max: 160 }),
      { key: "items", label: "Numbers", kind: "list", itemLabel: "Number", max: 8, fields: [text("value", "Number", { max: 30 }), text("label", "Label", { max: 120 })] },
    ],
    defaults: { heading: "", items: [{ value: "100+", label: "Happy customers" }, { value: "24/7", label: "Support" }, { value: "5", label: "Years running" }] },
  },
  {
    type: "latestPosts",
    label: "Latest blog posts",
    description: "Your newest published blog posts, updated automatically.",
    category: "Live content",
    fields: [text("heading", "Heading", { max: 160 }), count("count", "How many"), text("linkLabel", "\"View all\" link text", { max: 60 })],
    defaults: { heading: "From the blog", count: 3, linkLabel: "View all" },
  },
  {
    type: "latestCourses",
    label: "Latest courses",
    description: "Your newest published courses, updated automatically.",
    category: "Live content",
    fields: [text("heading", "Heading", { max: 160 }), count("count", "How many"), text("linkLabel", "\"View all\" link text", { max: 60 })],
    defaults: { heading: "Latest courses", count: 3, linkLabel: "View all" },
  },
  {
    type: "reviews",
    label: "Reviews",
    description: "Customer reviews from your reviews page.",
    category: "Live content",
    fields: [text("heading", "Heading", { max: 160 }), count("count", "How many"), text("linkLabel", "\"View all\" link text", { max: 60 })],
    defaults: { heading: "What people are saying", count: 3, linkLabel: "View all reviews" },
  },
  {
    type: "workflowDemo",
    label: "Workflow animation",
    description: "The animated \"how it works\" workflow demo.",
    category: "Media",
    fields: [text("heading", "Heading", { max: 160 }), textarea("text", "Text", { max: 600 })],
    defaults: { heading: "How it works", text: "" },
  },
  {
    type: "integrations",
    label: "Integration icons",
    description: "A grid of common app icons (email, calendar, chat, sheets...).",
    category: "Media",
    fields: [text("heading", "Heading", { max: 160 }), textarea("text", "Text", { max: 600 })],
    defaults: { heading: "Connects with your stack", text: "" },
  },
  {
    type: "featuredOn",
    label: "Featured on badges",
    description: "A row of \"as featured on\" badges linking to directories/launch sites that list you, with a seamless auto-scrolling marquee.",
    category: "Media",
    fields: [
      text("heading", "Heading", { max: 80 }),
      {
        key: "items",
        label: "Badges",
        kind: "list",
        itemLabel: "Badge",
        max: 20,
        fields: [
          text("name", "Directory name (for your reference only)", { max: 80 }),
          link("href", "Your listing page on that directory"),
          image("badge", "Badge image (their hotlink URL, or upload a copy)"),
          text("alt", "Alt text", { max: 160 }),
          { key: "width", label: "Badge width (its real pixel size, for layout)", kind: "number", min: 16, max: 2000 },
          { key: "height", label: "Badge height (its real pixel size, for layout)", kind: "number", min: 16, max: 2000 },
        ],
      },
    ],
    defaults: { heading: "Featured on", items: [] },
  },
  {
    type: "form",
    label: "Form",
    description: "A contact form (with email confirmation) or a newsletter signup box, in one configurable section.",
    category: "Forms",
    fields: [
      select("mode", "Type", [["contact", "Contact form (name, email, message)"], ["newsletter", "Newsletter signup (email only)"]]),
      text("heading", "Heading", { max: 160 }),
      textarea("text", "Intro", { max: 600 }),
      text("messageLabel", "Message field label", { max: 120, help: "Contact form only." }),
      toggle("showContactDetails", "Show contact details beside the form", "Contact form only."),
      text("detailsHeading", "Contact details heading", { max: 120, help: "Contact form only, when details are shown." }),
      text("successHeading", "Thank-you heading", { max: 120, help: "Contact form only." }),
      text("successText", "Thank-you text", { max: 300, help: "Contact form only." }),
    ],
    defaults: {
      mode: "contact",
      heading: "Contact us",
      text: "Send us a message and we'll get back to you.",
      messageLabel: "How can we help?",
      showContactDetails: true,
      detailsHeading: "Contact information",
      successHeading: "Thanks, got it.",
      successText: "We'll get back to you shortly.",
    },
  },
  {
    // Deprecated: superseded by "form" (mode: "contact"). Kept functional
    // until 164_generic_form_block.sql has run against this deployment's
    // database and converted every existing block -- removing this before
    // then would make normalizeBlock throw on any page that still has one.
    deprecated: true,
    type: "contactForm",
    label: "Contact form",
    description: "The contact form (with email confirmation), and optionally your contact details beside it.",
    category: "Forms",
    fields: [
      text("heading", "Heading", { max: 160 }),
      textarea("text", "Intro", { max: 600 }),
      text("messageLabel", "Message field label", { max: 120 }),
      toggle("showDetails", "Show contact details beside the form"),
      text("detailsHeading", "Contact details heading", { max: 120 }),
      text("successHeading", "Thank-you heading", { max: 120 }),
      text("successText", "Thank-you text", { max: 300 }),
    ],
    defaults: { heading: "Contact us", text: "Send us a message and we'll get back to you.", messageLabel: "How can we help?", showDetails: true, detailsHeading: "Contact information", successHeading: "Thanks, got it.", successText: "We'll get back to you shortly." },
  },
  {
    // Deprecated: superseded by "form" (mode: "newsletter"). See the note
    // on "contactForm" above.
    deprecated: true,
    type: "newsletter",
    label: "Newsletter signup",
    description: "An email signup box for your newsletter.",
    category: "Forms",
    fields: [text("heading", "Heading", { max: 160 }), textarea("text", "Text", { max: 400 })],
    defaults: { heading: "Get updates in your inbox", text: "" },
  },
  {
    type: "contactDetails",
    label: "Contact details",
    description: "Your email, phone, hours and address from Site settings.",
    category: "Business",
    fields: [text("heading", "Heading", { max: 160 })],
    defaults: { heading: "Contact information" },
  },
  {
    type: "socialIcons",
    label: "Social icons",
    description: "Round icon links to your social profiles.",
    category: "Business",
    fields: [
      select("size", "Icon size", [["sm", "Small"], ["md", "Medium"], ["lg", "Large"]]),
      select("align", "Alignment", [["left", "Left"], ["center", "Center"], ["right", "Right"]]),
      {
        key: "items",
        label: "Profiles",
        kind: "list",
        itemLabel: "Profile",
        max: 8,
        fields: [select("platform", "Platform", SOCIAL_PLATFORMS.map((p) => [p, p[0].toUpperCase() + p.slice(1)] as [string, string])), link("href", "Profile URL")],
      },
    ],
    defaults: { size: "md", align: "left", items: [] },
    nestable: true,
  },
  {
    type: "businessDetails",
    label: "Business details",
    description: "Owner, registration number and address from Site settings, plus any extra facts.",
    category: "Business",
    fields: [
      text("heading", "Heading", { max: 160 }),
      textarea("intro", "Intro (blank shows your legal line)", { max: 600 }),
      toggle("showOwner", "Show owner"),
      toggle("showRegistration", "Show registration number"),
      toggle("showAddress", "Show address"),
      { key: "items", label: "Extra facts", kind: "list", itemLabel: "Fact", max: 8, fields: [text("label", "Label", { max: 80 }), text("value", "Value", { max: 300 })] },
      toggle("showContactLink", "Add a link to the contact page"),
    ],
    defaults: { heading: "Business details", intro: "", showOwner: true, showRegistration: true, showAddress: true, items: [], showContactLink: true },
  },
  {
    type: "spacer",
    label: "Spacer",
    description: "Empty space, optionally with a dividing line.",
    category: "Layout",
    fields: [select("size", "Size", [["sm", "Small"], ["md", "Medium"], ["lg", "Large"]]), toggle("divider", "Show a line")],
    defaults: { size: "md", divider: false },
    nestable: true,
  },
  {
    type: "builtIn",
    label: "Page's own content",
    description: "Where this built-in page's own content (its list, form or policy text) appears. Move it, or remove it to replace it entirely with your own sections.",
    category: "Layout",
    fields: [],
    defaults: {},
    internal: true,
  },
];

const DEF_BY_TYPE = new Map(BLOCK_DEFS.map((d) => [d.type, d]));

export function getBlockDef(type: string): BlockDef | undefined {
  return DEF_BY_TYPE.get(type);
}

/** Spacers and the built-in content marker have no background/spacing. */
function hasSectionFields(def: BlockDef): boolean {
  return !def.internal && def.type !== "spacer";
}

export function blockFields(def: BlockDef): FieldDef[] {
  return hasSectionFields(def) ? [...def.fields, ...SECTION_FIELDS, ...STYLE_FIELDS] : def.fields;
}

/** The Style tab's fields for a block (background/spacing/anchor plus the
 * finer padding/margin/color/etc. overrides), separate from its own
 * content fields -- for an editor UI that splits Content vs Style, like
 * blockFields() does for one combined list. [] when the block has neither
 * (spacer, the built-in content marker). */
export function styleFields(def: BlockDef): FieldDef[] {
  return hasSectionFields(def) ? [...SECTION_FIELDS, ...STYLE_FIELDS] : [];
}

/** What the console shows for a block type. `description` is written for
 * an API/MCP client, which gets one read, has no UI, and needs the whole
 * rule (including the Tailwind caveat) in that one read -- in a settings
 * panel or an Add-section tile the same text is a paragraph nobody asked
 * for, above the fields they came for. */
export function blockSummary(def: BlockDef): string {
  return def.summary || def.description;
}

export function newBlockId(): string {
  return `b_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function sectionDefaults(def: BlockDef): Record<string, unknown> {
  return hasSectionFields(def) ? { ...SECTION_DEFAULTS, ...STYLE_DEFAULTS } : {};
}

/** A fresh block of `type` with its default props. */
export function createBlock(type: string): PageBlock {
  const def = getBlockDef(type);
  if (!def) throw new Error(`Unknown block type "${type}".`);
  return { id: newBlockId(), type, props: structuredClone({ ...sectionDefaults(def), ...def.defaults }) };
}

/** Builds a Hero out of ordinary elements instead of the bespoke `hero`
 * block: a heading, optional eyebrow/body text and up to two buttons on
 * one side, an image on the other -- every piece individually selectable,
 * stylable and inline-editable on the canvas the moment it's dropped,
 * through the exact same Row > Column > Element machinery as anything
 * else, rather than one block only editable through its own sidebar form.
 * Optionally seeded from an existing atomic Hero's props (see
 * convertBlockToElements) so converting one keeps its content. Loses the
 * bespoke dark-theme gradient/image-glow HeroView renders -- `background:
 * "dark"` (the same dark-section look any block's Style tab offers) gets
 * close, not identical; the trade is real per-piece editability instead
 * of a fixed, more polished band. */
function createHeroElements(source: Record<string, unknown> = {}): PageBlock {
  const str = (key: string, fallback = ""): string => (typeof source[key] === "string" ? (source[key] as string) : fallback);
  const eyebrow = str("eyebrow");
  const heading = str("heading", "Your headline goes here");
  const text = str("text");
  const primaryLabel = str("primaryLabel", "Get in touch");
  const primaryHref = str("primaryHref", "/contact");
  const secondaryLabel = str("secondaryLabel");
  const secondaryHref = str("secondaryHref");
  const image = str("image");
  const imageAlt = str("imageAlt");

  const left: PageBlock[] = [];
  if (eyebrow) {
    const el = createBlock("heading");
    left.push({ ...el, props: { ...el.props, text: eyebrow, level: "h4", fontSize: "sm", fontWeight: "semibold" } });
  }
  const headingEl = createBlock("heading");
  left.push({ ...headingEl, props: { ...headingEl.props, text: heading, level: "h2" } });
  if (text) {
    const el = createBlock("richText");
    left.push({ ...el, props: { ...el.props, html: `<p>${escapeHtml(text)}</p>` } });
  }
  if (primaryLabel && primaryHref) {
    const el = createBlock("button");
    left.push({ ...el, props: { ...el.props, label: primaryLabel, href: primaryHref, style: "primary" } });
  }
  if (secondaryLabel && secondaryHref) {
    const el = createBlock("button");
    left.push({ ...el, props: { ...el.props, label: secondaryLabel, href: secondaryHref, style: "outline" } });
  }

  const right: PageBlock[] = [];
  if (image) {
    const el = createBlock("image");
    right.push({ ...el, props: { ...el.props, image, alt: imageAlt, size: "contained" } });
  }

  const row = createBlock("row");
  return { ...row, props: { ...row.props, columns: "2", gap: "lg", background: "dark", items: [left, right] } };
}

/** Which "Add section" palette entries insert a decomposed element tree
 * instead of their own atomic block type -- see createInsertedBlock().
 * Hero is first; more composite presets join this list as they're
 * rebuilt on the new primitives (see the page-editor rebuild plan). The
 * atomic type itself stays fully defined and rendered for whatever's
 * already stored on existing pages -- this only changes what picking it
 * from the palette creates from now on. */
const DECOMPOSED_TEMPLATES: Record<string, (source?: Record<string, unknown>) => PageBlock> = {
  hero: createHeroElements,
};

/** What picking `type` from the Add-section palette actually inserts --
 * createBlock()'s plain atomic block, or, for a type in
 * DECOMPOSED_TEMPLATES, a pre-built tree of ordinary elements instead.
 * Only the console editor's insertion points call this; createBlock()
 * itself (normalizeBlock, the MCP/API create/update tools) is untouched,
 * so a script or API client asking for a plain "hero" still gets exactly
 * that. */
export function createInsertedBlock(type: string): PageBlock {
  return DECOMPOSED_TEMPLATES[type]?.() ?? createBlock(type);
}

/** Whether `type` has a decomposed-elements version to offer a "Convert
 * to individual elements" action for -- see convertBlockToElements(). */
export function hasElementTemplate(type: string): boolean {
  return type in DECOMPOSED_TEMPLATES;
}

/** Replaces one existing block in place with its decomposed-elements
 * version, seeded from its current props so nothing already written is
 * lost -- the opt-in upgrade path for a page that already has the old
 * atomic block (see the page-editor rebuild plan's non-negotiable
 * constraint: nothing auto-converts a stored block, ever). Returns
 * `null` if `type` has no decomposed template to convert to. */
export function convertBlockToElements(block: PageBlock): PageBlock | null {
  const build = DECOMPOSED_TEMPLATES[block.type];
  return build ? build(block.props) : null;
}

const MAX_BLOCKS = 60;
const MAX_ROW_ITEMS_PER_COLUMN = 10;
const DEFAULT_TEXT_LIMIT = 300;
const RICHTEXT_LIMIT = 100_000;
const CODE_LIMIT = 20_000;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/;

/** Absolute https/http image URLs or site-relative paths only. */
export function safeImageUrl(value: unknown): string {
  const url = typeof value === "string" ? value.trim().slice(0, 1000) : "";
  if (!url) return "";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return "";
}

function normalizeField(field: FieldDef, value: unknown, fallback: unknown, sanitizeHtml: (html: string) => string): unknown {
  switch (field.kind) {
    case "text":
    case "textarea": {
      const limit = field.max ?? DEFAULT_TEXT_LIMIT;
      return typeof value === "string" ? value.slice(0, limit) : typeof fallback === "string" ? fallback : "";
    }
    case "richtext":
      return typeof value === "string" ? sanitizeHtml(value.slice(0, RICHTEXT_LIMIT)) : typeof fallback === "string" ? fallback : "";
    case "link":
      return value === undefined ? (typeof fallback === "string" ? fallback : "") : safeHref(value);
    case "image":
      return value === undefined ? (typeof fallback === "string" ? fallback : "") : safeImageUrl(value);
    case "select":
    case "iconPicker": {
      const allowed = field.options.map((o) => o.value);
      const v = typeof value === "number" ? String(value) : value;
      if (typeof v === "string" && allowed.includes(v)) return v;
      return typeof fallback === "string" && allowed.includes(fallback) ? fallback : allowed[0];
    }
    case "number": {
      const n = typeof value === "string" ? Number(value) : value;
      if (typeof n === "number" && Number.isFinite(n)) return Math.min(field.max, Math.max(field.min, Math.round(n)));
      return typeof fallback === "number" ? fallback : field.min;
    }
    case "toggle":
      return typeof value === "boolean" ? value : typeof fallback === "boolean" ? fallback : false;
    case "color": {
      const v = typeof value === "string" ? value.trim() : "";
      if (HEX_COLOR_RE.test(v)) return v;
      return typeof fallback === "string" && HEX_COLOR_RE.test(fallback) ? fallback : "";
    }
    // Deliberately unsanitized, unlike "richtext" -- this is a power-user
    // escape hatch for embed codes/custom scripts, gated the same way
    // every other write to a page already is (an authenticated admin
    // session or an API token with pages:write), not a new trust boundary.
    case "code":
      return typeof value === "string" ? value.slice(0, field.max ?? CODE_LIMIT) : typeof fallback === "string" ? fallback : "";
    case "datetime": {
      // Stored as a UTC ISO string (the console's DateTimeField converts
      // the admin's local-time input to this before it ever reaches here)
      // so every visitor's browser counts down to the same real instant.
      const v = typeof value === "string" ? value.trim() : "";
      if (v && !Number.isNaN(Date.parse(v))) return v;
      return typeof fallback === "string" && !Number.isNaN(Date.parse(fallback)) ? fallback : "";
    }
    case "list": {
      const items = Array.isArray(value) ? value : Array.isArray(fallback) ? fallback : [];
      return items.slice(0, field.max).map((item) => {
        const raw = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const out: Record<string, unknown> = {};
        for (const sub of field.fields) out[sub.key] = normalizeField(sub, raw[sub.key], undefined, sanitizeHtml);
        return out;
      });
    }
  }
}

export class BlockValidationError extends Error {}

/** Tags that mean the author thought they were writing a whole page
 * rather than one section of this one.
 *
 * This is the single most common way a hand-written section comes out
 * wrong, and it is not a cosmetic slip: the site already renders its real
 * header (with the real logo and the real menu, which the owner edits
 * from Navigation) and its real footer around every page, so a section
 * that brings its own gives the visitor two headers, two logos and two
 * footers stacked on one screen. It also quietly forks the navigation --
 * the hand-written copy keeps pointing wherever it was written to point
 * long after the real menu changes.
 *
 * Rejected on save rather than stripped out: stripping leaves a design
 * with a hole where it expected its own nav and teaches the author
 * nothing, while a refusal naming the exact tags gets fixed on the next
 * attempt. The owner chose this explicitly. */
const PAGE_LEVEL_TAGS: { tag: string; why: string }[] = [
  { tag: "header", why: "the site renders its own header on every page" },
  { tag: "nav", why: "the site's menu is edited from Navigation, not written into a section" },
  { tag: "footer", why: "the site renders its own footer on every page" },
  { tag: "main", why: "the page already has one <main>, and a second is invalid HTML" },
  { tag: "html", why: "a section is a fragment inside a page, not a document" },
  { tag: "head", why: "a section is a fragment inside a page, not a document" },
  { tag: "body", why: "a section is a fragment inside a page, not a document" },
  { tag: "title", why: "set the page's title with the title/metaTitle field instead" },
];

/** Reports every page-level tag in one go, so one retry fixes all of
 * them instead of discovering them one refusal at a time. */
export function findPageLevelTags(html: string): { tag: string; why: string }[] {
  return PAGE_LEVEL_TAGS.filter(({ tag }) => new RegExp(`<\\s*${tag}(?=[\\s/>])`, "i").test(html));
}

function assertSectionHtml(html: string): void {
  const found = findPageLevelTags(html);
  if (found.length === 0) return;
  const list = found.map(({ tag, why }) => `<${tag}> (${why})`).join("; ");
  throw new BlockValidationError(
    `A custom section can't contain page-level markup. Remove: ${list}. ` +
      "Build only the band of the page this section is -- open with <section> or <div> and go straight into its own content. " +
      "The real header, logo, menu and footer are rendered around every page already, so a section that brings its own shows the visitor two of each. " +
      "Links to other pages are fine; a navigation bar is not."
  );
}

/** Cleans one block. Unknown types throw (so an API caller learns about a
 * typo instead of silently losing a section); unknown props are dropped;
 * missing props get the type's defaults. `nestableOnly` restricts to
 * element types allowed inside a row's columns (see the "row" block). */
export function normalizeBlock(raw: unknown, sanitizeHtml: (html: string) => string, opts: { nestableOnly?: boolean } = {}): PageBlock {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const type = typeof r.type === "string" ? r.type : "";
  const def = getBlockDef(type);
  if (!def) {
    throw new BlockValidationError(`Unknown block type "${type}". Valid types: ${BLOCK_DEFS.map((d) => d.type).join(", ")}.`);
  }
  if (opts.nestableOnly && !def.nestable) {
    throw new BlockValidationError(
      `"${type}" can't be used inside a row's column. Types allowed there: ${BLOCK_DEFS.filter((d) => d.nestable).map((d) => d.type).join(", ")}.`
    );
  }
  // Accept both { type, props: {...} } and a flat { type, heading, ... }
  // so hand-written API/MCP calls don't have to nest.
  const rawProps = r.props && typeof r.props === "object" ? (r.props as Record<string, unknown>) : r;
  const defaults: Record<string, unknown> = { ...sectionDefaults(def), ...def.defaults };
  const props: Record<string, unknown> = {};
  for (const field of blockFields(def)) {
    props[field.key] = normalizeField(field, rawProps[field.key], defaults[field.key], sanitizeHtml);
  }
  if (type === "row") {
    const columnCount = Number(props.columns) || 2;
    const rawItems = Array.isArray(rawProps.items) ? rawProps.items : [];
    const items: PageBlock[][] = [];
    for (let i = 0; i < columnCount; i++) {
      const column = Array.isArray(rawItems[i]) ? rawItems[i] : [];
      items.push(column.slice(0, MAX_ROW_ITEMS_PER_COLUMN).map((item: unknown) => normalizeBlock(item, sanitizeHtml, { nestableOnly: true })));
    }
    props.items = items;
  }
  if (type === "custom") assertSectionHtml(String(props.html || ""));
  const id = typeof r.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(r.id) ? r.id : newBlockId();
  return { id, type, props };
}

export function normalizeBlocks(raw: unknown, sanitizeHtml: (html: string) => string, options: { allowBuiltIn: boolean }): PageBlock[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new BlockValidationError("blocks must be an array.");
  if (raw.length > MAX_BLOCKS) throw new BlockValidationError(`A page can hold at most ${MAX_BLOCKS} sections.`);
  const blocks = raw.map((b) => normalizeBlock(b, sanitizeHtml));
  const builtInCount = blocks.filter((b) => b.type === "builtIn").length;
  if (builtInCount > 0 && !options.allowBuiltIn) {
    throw new BlockValidationError("The \"Page's own content\" section only exists on built-in pages.");
  }
  if (builtInCount > 1) throw new BlockValidationError("The \"Page's own content\" section can only appear once.");
  const seen = new Set<string>();
  for (const block of blocks) {
    if (seen.has(block.id)) block.id = newBlockId();
    seen.add(block.id);
  }
  return blocks;
}

/** Placeholders usable in any text field, filled in at render time. */
export const MERGE_TAGS: { tag: string; label: string }[] = [
  { tag: "{{site_name}}", label: "Site name" },
  { tag: "{{business_name}}", label: "Legal or trading name" },
  { tag: "{{owner_name}}", label: "Owner name" },
  { tag: "{{email}}", label: "Contact email" },
  { tag: "{{phone}}", label: "Phone" },
  { tag: "{{address}}", label: "Full address" },
  { tag: "{{hours}}", label: "Business hours" },
  { tag: "{{year}}", label: "Current year" },
];

export function applyMergeTags(value: string, vars: Record<string, string>): string {
  if (!value.includes("{{")) return value;
  return value.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) => (key in vars ? vars[key] : match));
}

/** A plain-language summary of the block library for API/MCP callers. */
export function describeBlockTypes() {
  const describeField = (f: FieldDef): Record<string, unknown> => {
    const base: Record<string, unknown> = { key: f.key, label: f.label, kind: f.kind };
    if (f.help) base.help = f.help;
    if (f.kind === "select") base.options = f.options.map((o) => o.value);
    if (f.kind === "number") Object.assign(base, { min: f.min, max: f.max });
    if (f.kind === "text" || f.kind === "textarea") base.maxLength = f.max ?? 300;
    if (f.kind === "code") base.maxLength = f.max ?? 20_000;
    if (f.kind === "richtext") base.maxLength = 100_000;
    if (f.kind === "list") Object.assign(base, { max: f.max, itemFields: f.fields.map(describeField) });
    return base;
  };
  return BLOCK_DEFS.map((def) => ({
    type: def.type,
    label: def.label,
    description: def.description,
    builtInPagesOnly: Boolean(def.internal),
    deprecated: Boolean(def.deprecated),
    fields: blockFields(def).map(describeField),
    example: { type: def.type, props: def.defaults },
  }));
}
