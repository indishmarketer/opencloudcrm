import Link from "next/link";
import {
  Award,
  Bell,
  Calendar,
  CheckCircle,
  Clock,
  CreditCard,
  Download,
  Gift,
  Globe,
  Heart,
  Lightbulb,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Play,
  Rocket,
  Settings,
  Shield,
  Smile,
  Sparkles,
  Star,
  Target,
  ThumbsUp,
  TrendingUp,
  Users,
  Zap,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { extractYoutubeId } from "@/lib/youtube";
import { serializeJsonLd } from "@/lib/jsonLd";
import type { ResolvedBusiness } from "@/lib/businessProfile";
import type { PageBlock } from "@/lib/pageBlocks";
import type { LeadMagnet } from "@/lib/leadMagnets";
import type { BlogIndexEntry } from "@/lib/blogPosts";
import type { Reviewer } from "@/data/reviews";
import { resolveImage } from "@/lib/images";
import WorkflowDemo from "@/components/WorkflowDemo";
import IntegrationIcons from "@/components/IntegrationIcons";
import FeaturedOn from "@/components/FeaturedOn";
import GuidePopup from "@/components/GuidePopup";
import SavedFormPopup from "@/components/SavedFormPopup";
import SavedFormBlock from "@/components/pageBlocks/SavedFormBlock";
import CountdownTimer from "@/components/CountdownTimer";
import BusinessContactDetails from "@/components/BusinessContactDetails";
import BlockImage from "@/components/pageBlocks/BlockImage";

/** Every block's actual visual output, as plain (non-async, no server-only
 * imports) components -- deliberately isomorphic: used by the public
 * renderer (src/components/pageBlocks/blocks.tsx, a thin server wrapper
 * that fetches each block's own live data then renders these) AND, with
 * the same props, directly by the console page editor's live canvas, so
 * what you see while editing is the exact real render, not an
 * approximation. The few blocks that need their own server-fetched data
 * (Hero's active lead magnet, latest posts/courses, reviews) take it as a
 * prop here instead of fetching it themselves -- see blocks.tsx. */

export type Props = Record<string, unknown>;

export const str = (props: Props, key: string): string => (typeof props[key] === "string" ? (props[key] as string) : "");
export const num = (props: Props, key: string, fallback: number): number => (typeof props[key] === "number" ? (props[key] as number) : fallback);
const bool = (props: Props, key: string): boolean => props[key] === true;
const list = (props: Props, key: string): Props[] => (Array.isArray(props[key]) ? (props[key] as Props[]) : []);

// Two adjacent sections each contribute their own top/bottom padding, so the
// visible gap between stacked sections is roughly double these numbers --
// kept modest for that reason, rather than sized as if each section stood
// alone.
const SPACING: Record<string, string> = { normal: "py-10 md:py-16", compact: "py-6 md:py-8", none: "py-0" };
const BACKGROUND: Record<string, string> = { default: "", soft: "bg-paper-soft", dark: "page-section-dark" };

// The Style tab's finer overrides. Every lookup is a literal Tailwind class
// written here in source -- Tailwind's build-time scanner only generates
// classes it can see spelled out like this, never ones assembled from a
// runtime string (e.g. a DB value), so these must stay plain object
// literals rather than template-built class names. "" (not in the map)
// means "no override, use the block's normal default."
const PADDING_Y_OVERRIDE: Record<string, string> = { none: "py-0", sm: "py-4 md:py-6", lg: "py-20 md:py-28", xl: "py-28 md:py-36" };
const PADDING_X_OVERRIDE: Record<string, string> = { none: "px-0", sm: "px-3", lg: "px-10" };
const MARGIN_TOP: Record<string, string> = { sm: "mt-6", lg: "mt-16" };
const MARGIN_BOTTOM: Record<string, string> = { sm: "mb-6", lg: "mb-16" };
const MAX_WIDTH_OVERRIDE: Record<string, string> = { narrow: "max-w-3xl", normal: "max-w-6xl", wide: "max-w-7xl", full: "max-w-none" };
const BORDER_RADIUS: Record<string, string> = { none: "rounded-none", lg: "rounded-2xl", full: "rounded-[2.5rem]" };

/** Keys must match ICON_NAMES in src/lib/pageBlocks.ts exactly -- that file
 * drives the picker options, this map is what actually resolves a chosen
 * key to a glyph. */
/** Exported so the console's icon-picker field (PageBlockFields.tsx) can
 * render the real glyphs in its grid instead of just option labels --
 * same source of truth IconBlock itself renders from. */
export const ICON_COMPONENTS: Record<string, LucideIcon> = {
  star: Star,
  heart: Heart,
  zap: Zap,
  shield: Shield,
  rocket: Rocket,
  mail: Mail,
  phone: Phone,
  globe: Globe,
  arrowRight: ArrowRight,
  thumbsUp: ThumbsUp,
  award: Award,
  clock: Clock,
  mapPin: MapPin,
  users: Users,
  trendingUp: TrendingUp,
  lock: Lock,
  gift: Gift,
  sparkles: Sparkles,
  smile: Smile,
  messageCircle: MessageCircle,
  calendar: Calendar,
  download: Download,
  play: Play,
  checkCircle: CheckCircle,
  target: Target,
  lightbulb: Lightbulb,
  package: Package,
  creditCard: CreditCard,
  bell: Bell,
  settings: Settings,
};
const ICON_SIZE: Record<string, string> = { sm: "h-6 w-6", md: "h-8 w-8", lg: "h-12 w-12" };

/** The shared outer wrapper: background, vertical spacing, anchor id, and
 * the site's standard content width, plus the Style tab's padding/margin/
 * max-width/corner/custom-background overrides. Hero and the "band" Call
 * to action don't use this (bespoke, art-directed full-bleed layouts), so
 * those two ignore the container style fields -- documented on the fields
 * themselves. */
export function Section({ props, children, width = "max-w-6xl" }: { props: Props; children: React.ReactNode; width?: string }) {
  const background = BACKGROUND[str(props, "background")] ?? "";
  const spacing = PADDING_Y_OVERRIDE[str(props, "paddingY")] ?? SPACING[str(props, "spacing")] ?? SPACING.normal;
  const margin = `${MARGIN_TOP[str(props, "marginTop")] ?? ""} ${MARGIN_BOTTOM[str(props, "marginBottom")] ?? ""}`.trim();
  const radius = BORDER_RADIUS[str(props, "borderRadius")] ?? "";
  const backgroundColor = str(props, "backgroundColor");
  const innerWidth = MAX_WIDTH_OVERRIDE[str(props, "maxWidth")] ?? width;
  const paddingX = PADDING_X_OVERRIDE[str(props, "paddingX")] ?? "px-6";
  return (
    <section
      id={str(props, "anchor") || undefined}
      className={`${background} ${spacing} ${margin} ${radius}`.trim()}
      style={backgroundColor ? { backgroundColor } : undefined}
    >
      <div className={`mx-auto ${innerWidth} ${paddingX}`}>{children}</div>
    </section>
  );
}

/** The lighter equivalent of Section for an element dropped inside a row's
 * column: same padding/margin/corner/background overrides, but no anchor
 * section, no mx-auto max-width centering (the column already constrains
 * width) and no full-bleed background band. */
function ElementBox({ props, children }: { props: Props; children: React.ReactNode }) {
  const className = [
    PADDING_Y_OVERRIDE[str(props, "paddingY")] ?? "",
    PADDING_X_OVERRIDE[str(props, "paddingX")] ?? "",
    MARGIN_TOP[str(props, "marginTop")] ?? "",
    MARGIN_BOTTOM[str(props, "marginBottom")] ?? "",
    BORDER_RADIUS[str(props, "borderRadius")] ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const backgroundColor = str(props, "backgroundColor");
  return (
    <div className={className} style={backgroundColor ? { backgroundColor } : undefined}>
      {children}
    </div>
  );
}

/** Lets the console editor's canvas edit a single text field in place
 * (click it, type) instead of only through the sidebar form. Only ever
 * supplied by the editor's own call sites (ConsolePageEditor.tsx,
 * LiveBlockFrame.tsx) for whichever element is currently selected -- never
 * by the public renderer, so an ordinary page visitor never sees this. */
export type InlineEdit = { value: string; onChange: (v: string) => void };

/** A chrome-less text input swapped in for static text while its element
 * is selected. No classes of its own beyond layout (`w-full`, zero
 * padding/border/background) -- it inherits font/color from whatever
 * element it's nested inside via Tailwind preflight's `font: inherit;
 * color: inherit` reset on form controls, so it looks exactly like the
 * text it's replacing rather than needing every caller to repeat that
 * element's own classes. */
function InlineTextInput({
  edit,
  placeholder,
  className,
  style,
  autoWidth,
}: {
  edit: InlineEdit;
  placeholder?: string;
  className?: string;
  /** Pass the same resolved style textStyleAttrs gave the static text this
   * replaces (its color, and its size/weight when those aren't already
   * covered by `className`) -- inheriting them from a wrapping element
   * isn't reliable once that element's own children have their own
   * explicit size/weight classes (see IconBlock). */
  style?: React.CSSProperties;
  /** For text sitting inside a shrink-to-fit box like a button or an icon
   * label -- a plain `w-full` input there would stretch the box to its
   * whole flex row instead of hugging the text. The HTML `size` attribute
   * (character-count width, recomputed as you type) keeps the box sized to
   * its content instead, same as the button/icon look like before editing. */
  autoWidth?: boolean;
}) {
  return (
    <input
      type="text"
      value={edit.value}
      onChange={(e) => edit.onChange(e.target.value)}
      placeholder={placeholder}
      size={autoWidth ? Math.max((edit.value || placeholder || "").length, 4) : undefined}
      // pointer-events-auto! forces this clickable/typable regardless of
      // an ancestor's INERT wrapper -- for a nested element (inside a row's
      // column), NestedElementFrame already un-inerts its OWN wrapper when
      // this input is showing, but that wrapper still sits inside the
      // ROW's own (separately inert) TopBlockFrame, and INERT's
      // `[&_input]:pointer-events-none` is a descendant selector that
      // reaches straight through an in-between un-inert div -- confirmed
      // live, same failure mode as the toolbar buttons' in LiveBlockFrame.tsx.
      className={`pointer-events-auto! border-none bg-transparent p-0 outline-none ${autoWidth ? "" : "w-full"} ${className || ""}`.trim()}
      // `textAlign: inherit` is NOT a redundant default: unlike plain text,
      // an <input>'s own user-agent stylesheet gives it a fixed
      // `text-align: start` that wins over whatever its ancestor's
      // text-align says, because form controls don't inherit text-align
      // the way ordinary text does. Without forcing it back to `inherit`
      // here, every rich element's textAlign override would work for its
      // STATIC render and silently do nothing the moment it's selected
      // and swapped for this input -- confirmed live, that's exactly what
      // was happening. `...style` still lets a caller override further.
      style={{ textAlign: "inherit", ...style }}
    />
  );
}

// --- Rich style model (styleModel: "rich" block types) ---------------
//
// Real numbers and real colors, applied as inline `style`, not a lookup
// from an enum value to a literal Tailwind class. An inline style always
// wins over a class for the same CSS property -- that's the CSS cascade,
// not a convention this file has to maintain -- so there's no version of
// the "which of two same-property classes does Tailwind happen to emit
// later" bug the old STYLE_FIELDS system kept producing. Every
// styleModel: "rich" block type (see pageBlocks.ts) renders through
// these instead of Section/ElementBox/textStyleAttrs above, which stay
// exactly as they are for every block type NOT on this list -- real
// pages already published with the old enum values keep meaning what
// they've always meant.
const FONT_WEIGHT_CSS: Record<string, React.CSSProperties["fontWeight"]> = { normal: 400, medium: 500, semibold: 600, bold: 700 };

function richBoxStyle(props: Props): React.CSSProperties {
  const style: React.CSSProperties = {
    paddingTop: `${num(props, "paddingY", 16)}px`,
    paddingBottom: `${num(props, "paddingY", 16)}px`,
    paddingLeft: `${num(props, "paddingX", 24)}px`,
    paddingRight: `${num(props, "paddingX", 24)}px`,
    marginTop: `${num(props, "marginTop", 0)}px`,
    marginBottom: `${num(props, "marginBottom", 0)}px`,
    borderRadius: `${num(props, "borderRadius", 0)}px`,
  };
  const bg = str(props, "backgroundColor");
  if (bg) style.backgroundColor = bg;
  return style;
}

function richTextStyle(props: Props): React.CSSProperties {
  const style: React.CSSProperties = {
    textAlign: (str(props, "textAlign") || "left") as React.CSSProperties["textAlign"],
    fontSize: `${num(props, "fontSize", 16)}px`,
    fontWeight: FONT_WEIGHT_CSS[str(props, "fontWeight")] ?? 400,
  };
  const color = str(props, "textColor");
  if (color) style.color = color;
  return style;
}

/** The rich-model equivalent of `Section` -- a top-level block's own
 * band, with a real pixel max-width (0 = none/full-bleed) instead of a
 * narrow/normal/wide/full enum. `widthDefault` is the sensible width for
 * this element type when the user hasn't set one (e.g. a Text block
 * reads better narrow than a full-width Image does). */
function RichSection({ props, children, widthDefault = 720 }: { props: Props; children: React.ReactNode; widthDefault?: number }) {
  const box = richBoxStyle(props);
  const { paddingLeft, paddingRight, ...outer } = box;
  const maxW = num(props, "maxWidth", 0);
  return (
    <section id={str(props, "anchor") || undefined} style={outer}>
      <div style={{ maxWidth: `${maxW > 0 ? maxW : widthDefault}px`, marginLeft: "auto", marginRight: "auto", paddingLeft, paddingRight }}>
        {children}
      </div>
    </section>
  );
}

/** The rich-model equivalent of `ElementBox` -- an element nested in a
 * row's column. No max-width centering (the column already constrains
 * width), same as ElementBox. */
function RichBox({ props, children }: { props: Props; children: React.ReactNode }) {
  return <div style={richBoxStyle(props)}>{children}</div>;
}

function SectionHeading({ heading, text, link }: { heading: string; text?: string; link?: { href: string; label: string } }) {
  if (!heading && !text) return null;
  return (
    <div className="mb-10">
      <div className="flex items-end justify-between gap-4">
        {heading && <h2 className="font-display text-3xl font-semibold">{heading}</h2>}
        {link && link.label && (
          <Link href={link.href} className="shrink-0 text-sm font-medium text-ink-soft hover:text-ink">
            {link.label} →
          </Link>
        )}
      </div>
      {text && <p className="mt-3 max-w-2xl whitespace-pre-line text-ink-soft">{text}</p>}
    </div>
  );
}

// Split so ButtonBlock (the one place these have a real Style-tab
// override to resolve against) can swap text-sm/text-center for an
// override instead of leaving both present -- see textStyleAttrs's doc
// comment. Every other caller just wants the fixed look, via the full
// constant below with those two folded back in.
const BUTTON_DARK_SHAPE = "rounded-full bg-ink px-6 py-3 font-medium text-paper transition-opacity hover:opacity-80";
const BUTTON_OUTLINE_SHAPE = "rounded-full border border-ink/25 px-6 py-3 font-medium text-ink transition-colors hover:border-ink";
const BUTTON_DARK = `${BUTTON_DARK_SHAPE} text-center text-sm`;
const BUTTON_OUTLINE = `${BUTTON_OUTLINE_SHAPE} text-center text-sm`;

function ButtonLink({ href, label, className, style }: { href: string; label: string; className: string; style?: React.CSSProperties }) {
  if (!href || !label) return null;
  const external = /^https?:\/\//.test(href);
  return external ? (
    <a href={href} className={className} style={style} target="_blank" rel="noreferrer">
      {label}
    </a>
  ) : (
    <Link href={href} className={className} style={style}>
      {label}
    </Link>
  );
}

/** Hero's own visual output. `activeLeadMagnet` is fetched by the caller
 * (the public renderer fetches it server-side; the editor canvas is handed
 * it once, pre-fetched, alongside the page) since this component itself
 * has to stay a plain sync function to be usable from client code. */
export function HeroView({ props, activeLeadMagnet }: { props: Props; activeLeadMagnet: LeadMagnet | null }) {
  const dark = str(props, "theme") !== "light";
  const image = str(props, "image");
  const backgroundImage = str(props, "backgroundImage");
  const backgroundColor = str(props, "backgroundColor");
  const primaryLabel = str(props, "primaryLabel");
  const primaryAction = str(props, "primaryAction");
  const guide = primaryAction === "leadMagnet" ? activeLeadMagnet : null;
  const formPopupId = primaryAction === "formPopup" ? Number(str(props, "primaryFormId")) || 0 : 0;
  const primaryClass = dark
    ? "rounded-full bg-paper px-6 py-3 text-center text-sm font-medium text-ink transition-opacity hover:opacity-80"
    : BUTTON_DARK;
  const secondaryClass = dark
    ? "rounded-full border border-white/30 px-6 py-3 text-center text-sm font-medium text-paper transition-colors hover:border-white"
    : BUTTON_OUTLINE;

  return (
    <section
      id={str(props, "anchor") || undefined}
      className={`relative overflow-hidden ${dark ? "bg-ink text-paper" : "bg-paper-gradient text-ink"}`}
      style={backgroundColor ? { backgroundColor } : undefined}
    >
      {backgroundImage ? (
        <>
          <div aria-hidden="true" className="absolute inset-0">
            <BlockImage src={backgroundImage} alt="" sizes="100vw" className="object-cover" />
          </div>
          {dark && <div aria-hidden="true" className="absolute inset-0 bg-ink/60" />}
        </>
      ) : (
        dark && (
          <div aria-hidden="true" className="absolute inset-0">
            <div className="directory-hero-grid absolute inset-0" />
            <div className="directory-hero-glow directory-hero-glow-a" />
            <div className="directory-hero-glow directory-hero-glow-b" />
          </div>
        )
      )}
      <div className={`relative mx-auto grid max-w-6xl items-center gap-16 px-6 py-24 md:py-32 ${image ? "md:grid-cols-2" : ""}`}>
        <div className={`flex flex-col gap-8 ${image ? "" : "max-w-3xl"}`}>
          {str(props, "eyebrow") && (
            <span className={`hero-animate hero-animate-1 w-fit rounded-full border px-4 py-1 text-xs uppercase tracking-widest ${dark ? "border-white/20 text-white/70" : "border-ink/15 text-ink-soft"}`}>
              {str(props, "eyebrow")}
            </span>
          )}
          <h1 className="hero-animate hero-animate-2 text-balance font-display text-4xl font-semibold leading-tight md:text-5xl">
            {str(props, "heading")}
          </h1>
          {str(props, "text") && (
            <p className={`hero-animate hero-animate-3 max-w-xl whitespace-pre-line text-lg ${dark ? "text-white/70" : "text-ink-soft"}`}>
              {str(props, "text")}
            </p>
          )}
          {(primaryLabel || str(props, "secondaryLabel")) && (
            <div className="hero-animate hero-animate-4 flex flex-col gap-4 sm:flex-row">
              {guide && primaryLabel ? (
                <GuidePopup
                  guide={{
                    id: guide.id,
                    slug: guide.slug,
                    title: guide.title,
                    headline: guide.headline,
                    subheadline: guide.subheadline,
                    coverImageUrl: guide.cover_image_url,
                  }}
                  buttonLabel={primaryLabel}
                  buttonClassName={primaryClass}
                />
              ) : formPopupId && primaryLabel ? (
                <SavedFormPopup formId={formPopupId} buttonLabel={primaryLabel} buttonClassName={primaryClass} />
              ) : (
                <ButtonLink href={str(props, "primaryHref")} label={primaryLabel} className={primaryClass} />
              )}
              <ButtonLink href={str(props, "secondaryHref")} label={str(props, "secondaryLabel")} className={secondaryClass} />
            </div>
          )}
        </div>
        {image && (
          <div className="relative mx-auto aspect-[900/1100] w-full max-w-sm">
            {dark && <div aria-hidden="true" className="hero-image-glow" />}
            <div className="relative z-10 h-full w-full overflow-hidden rounded-3xl">
              <BlockImage src={image} alt={str(props, "imageAlt")} sizes="(min-width: 768px) 400px, 90vw" className="object-cover" priority />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function PageHeaderBlock({ props }: { props: Props }) {
  const center = str(props, "align") === "center";
  return (
    <Section props={props}>
      <div className={center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
        {str(props, "eyebrow") && (
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">{str(props, "eyebrow")}</p>
        )}
        <h1 className={`font-display text-4xl font-semibold sm:text-5xl ${str(props, "eyebrow") ? "mt-4" : ""}`}>{str(props, "heading")}</h1>
        {str(props, "text") && <p className="mt-5 whitespace-pre-line text-lg leading-7 text-ink-soft">{str(props, "text")}</p>}
      </div>
    </Section>
  );
}

export function RichTextBlock({
  props,
  nested = false,
  editableHtml,
}: {
  props: Props;
  nested?: boolean;
  /** Selected on the canvas: the already-rendered editor, shown in place of
   * the static HTML so the text is written where it appears rather than in
   * a box in the sidebar. Passed in as a node because this file is shared
   * with the public site and must not import the editor itself. */
  editableHtml?: React.ReactNode;
}) {
  const t = richTextStyle(props);
  const content = editableHtml ? (
    <div className="page-richtext" style={t}>
      {editableHtml}
    </div>
  ) : (
    <div className="page-richtext" style={t} dangerouslySetInnerHTML={{ __html: str(props, "html") }} />
  );
  if (nested) return <RichBox props={props}>{content}</RichBox>;
  return (
    <RichSection props={props} widthDefault={str(props, "width") === "wide" ? 1152 : 720}>
      {content}
    </RichSection>
  );
}

export function HeadingBlock({ props, nested = false, editableText }: { props: Props; nested?: boolean; editableText?: InlineEdit }) {
  const text = str(props, "text");
  if (!text && !editableText) return null;
  const level = str(props, "level");
  // H1 is offered so a page can carry its main heading on an ordinary,
  // fully styleable Heading block instead of being forced to keep a Page
  // header section just to have one.
  const Heading = (level === "h1" ? "h1" : level === "h3" ? "h3" : level === "h4" ? "h4" : "h2") as
    | "h1"
    | "h2"
    | "h3"
    | "h4";
  const t = richTextStyle(props);
  const el = (
    <Heading className="font-display" style={t}>
      {editableText ? <InlineTextInput edit={editableText} placeholder="Heading text" /> : text}
    </Heading>
  );
  if (nested) return <RichBox props={props}>{el}</RichBox>;
  return (
    <RichSection props={props} widthDefault={720}>
      {el}
    </RichSection>
  );
}

export function ButtonBlock({ props, nested = false, editableText }: { props: Props; nested?: boolean; editableText?: InlineEdit }) {
  const label = str(props, "label");
  const href = str(props, "href");
  // A button can open a saved form in a popup instead of navigating. The
  // same mechanism Hero and CTA buttons already had -- it was simply never
  // offered on the standalone Button, which is the one you reach for when
  // you just want a button.
  const popupFormId = str(props, "action") === "formPopup" ? Number(str(props, "formId")) || 0 : 0;
  if (!label && !editableText) return null;
  if (!popupFormId && !href && !editableText) return null;
  // "align" (this block's own content field) positions the button within
  // its box -- left/center/right -- a different concern from the Style
  // tab's textAlign, which only affects how the label's own text sits
  // inside it.
  const alignClass = str(props, "align") === "center" ? "justify-center" : str(props, "align") === "right" ? "justify-end" : "justify-start";
  const outlined = str(props, "style") === "outline";
  const buttonShape = outlined ? BUTTON_OUTLINE_SHAPE : BUTTON_DARK_SHAPE;
  // A button had no colour of its own, so it was always the theme's dark
  // fill -- invisible on a dark section, with no way to change it. A filled
  // button colours its background, an outlined one its border; the label
  // follows buttonTextColor, or the fill colour when outlined.
  const fill = str(props, "buttonColor");
  const labelColor = str(props, "buttonTextColor");
  const t: React.CSSProperties = { ...richTextStyle(props) };
  if (fill) {
    if (outlined) {
      t.borderColor = fill;
      t.color = labelColor || fill;
    } else {
      t.backgroundColor = fill;
      t.borderColor = fill;
      t.color = labelColor || undefined;
    }
  } else if (labelColor) {
    t.color = labelColor;
  }
  if (labelColor) t.color = labelColor;
  // While editing the label in place, this renders as a plain <span>, not
  // a real <a>/<Link> -- clicking into the text to edit it must never
  // navigate away, href or not.
  const el = (
    <div className={`flex ${alignClass}`}>
      {editableText ? (
        <span className={buttonShape} style={t}>
          <InlineTextInput edit={editableText} placeholder="Button text" autoWidth />
        </span>
      ) : popupFormId ? (
        <SavedFormPopup formId={popupFormId} buttonLabel={label} buttonClassName={buttonShape} buttonStyle={t} />
      ) : (
        <ButtonLink href={href} label={label} className={buttonShape} style={t} />
      )}
    </div>
  );
  if (nested) return <RichBox props={props}>{el}</RichBox>;
  return (
    <RichSection props={props} widthDefault={720}>
      {el}
    </RichSection>
  );
}

export function IconBlock({ props, nested = false, editableText }: { props: Props; nested?: boolean; editableText?: InlineEdit }) {
  const Glyph = ICON_COMPONENTS[str(props, "icon")] ?? Star;
  const label = str(props, "label");
  const href = str(props, "href");
  const size = ICON_SIZE[str(props, "size")] ?? ICON_SIZE.md;
  // Resolved on the label itself (not a wrapping span) and used
  // identically whether editing or not.
  const t = richTextStyle(props);
  const inner = (
    <span className="inline-flex flex-col items-center gap-2">
      <Glyph className={size} strokeWidth={1.75} aria-hidden={label ? "true" : undefined} />
      {editableText ? (
        <InlineTextInput edit={editableText} placeholder="Label (optional)" style={t} autoWidth />
      ) : (
        label && <span style={t}>{label}</span>
      )}
    </span>
  );
  // Never a real link while the label is being edited in place -- same
  // reasoning as ButtonBlock above.
  const external = /^https?:\/\//.test(href);
  const el =
    editableText ? (
      inner
    ) : href ? (
      external ? (
        <a href={href} target="_blank" rel="noreferrer" className="inline-flex">
          {inner}
        </a>
      ) : (
        <Link href={href} className="inline-flex">
          {inner}
        </Link>
      )
    ) : (
      inner
    );
  const wrapped = <div className="flex justify-center">{el}</div>;
  if (nested) return <RichBox props={props}>{wrapped}</RichBox>;
  return (
    <RichSection props={props} widthDefault={320}>
      {wrapped}
    </RichSection>
  );
}

const ROW_GAP: Record<string, string> = { sm: "gap-4", md: "gap-8", lg: "gap-12" };
const ROW_COLUMNS: Record<string, string> = { "2": "md:grid-cols-2", "3": "sm:grid-cols-2 lg:grid-cols-3", "4": "md:grid-cols-2 lg:grid-cols-4" };

/** Dispatches a nested element inside a row's column -- a small subset of
 * the full block switch in blocks.tsx, restricted to `nestable: true`
 * types (enforced server-side by normalizeBlock's nestableOnly check).
 * Exported so the editor canvas's own column renderer (which adds
 * select/hover overlays and an "add element" control) can reuse it instead
 * of re-implementing the switch. */
export function NestedElement({
  block,
  editableText,
  editableHtml,
  editorEmpty = false,
}: {
  block: PageBlock;
  editableText?: InlineEdit;
  /** The rendered rich-text editor for a selected Text element inside a
   * column, so it is written in place just like one in a full-width
   * section. Passed in as a node: this file is shared with the public site
   * and must not import the editor. */
  editableHtml?: React.ReactNode;
  /** See EmptyBlockPlaceholder's doc comment -- only the editor's own
   * NestedElementFrame call site passes this. */
  editorEmpty?: boolean;
}) {
  const props = block.props as Props;
  switch (block.type) {
    case "richText":
      return <RichTextBlock props={props} nested editableHtml={editableHtml} />;
    case "heading":
      return <HeadingBlock props={props} nested editableText={editableText} />;
    case "image":
      return <ImageBlock props={props} nested editableText={editableText} editorEmpty={editorEmpty} />;
    case "video":
      return <VideoBlock props={props} nested editableText={editableText} editorEmpty={editorEmpty} />;
    case "button":
      return <ButtonBlock props={props} nested editableText={editableText} />;
    case "icon":
      return <IconBlock props={props} nested editableText={editableText} />;
    case "customCode":
      return <CustomCodeBlock props={props} nested />;
    case "countdown":
      return <CountdownBlock props={props} nested editorEmpty={editorEmpty} />;
    case "socialIcons":
      return <SocialIconsBlock props={props} nested />;
    case "spacer":
      return <SpacerBlock props={props} />;
    case "divider":
      return <DividerBlock props={props} nested />;
    case "list":
      return <ListBlock props={props} nested />;
    case "testimonial":
      return <TestimonialBlock props={props} nested />;
    case "rating":
      return <RatingBlock props={props} nested />;
    case "alert":
      return <AlertBlock props={props} nested />;
    case "blockquote":
      return <BlockquoteBlock props={props} nested />;
    case "table":
      return <TableBlock props={props} nested />;
    case "progress":
      return <ProgressBlock props={props} nested />;
    case "priceTable":
      return <PriceTableBlock props={props} nested />;
    case "teamMember":
      return <TeamMemberBlock props={props} nested />;
    case "steps":
      return <StepsBlock props={props} nested />;
    case "tabs":
      return <TabsBlock props={props} nested />;
    case "map":
      return <MapBlock props={props} nested editorEmpty={editorEmpty} />;
    case "embed":
      return <EmbedBlock props={props} nested editorEmpty={editorEmpty} />;
    case "breadcrumbs":
      return <BreadcrumbsBlock props={props} nested />;
    case "audio":
      return <AudioBlock props={props} nested editorEmpty={editorEmpty} />;
    case "logo":
      return <LogoBlock props={props} nested editorEmpty={editorEmpty} />;
    default:
      return null;
  }
}

export function RowBlock({
  props,
  renderColumn,
}: {
  props: Props;
  /** The editor overrides this to wrap each element in a select/hover
   * overlay and append its own "+ Add element" control; the default is
   * exactly what the public site renders. */
  renderColumn?: (column: PageBlock[], columnIndex: number) => React.ReactNode;
}) {
  const items = Array.isArray(props.items) ? (props.items as PageBlock[][]) : [];
  // Editor mode is signalled by renderColumn being passed at all (the
  // public site's call site never passes one -- see PageBlocks.tsx). A
  // freshly-dropped row's columns are empty until the owner adds
  // something, and the editor still needs to render each column's
  // "+ Add element" control in that state; only the public site should
  // hide a row that has nothing in it yet.
  const isEditor = Boolean(renderColumn);
  if (!isEditor && !items.some((column) => column.length > 0)) return null;
  const columns = ROW_COLUMNS[str(props, "columns")] ?? ROW_COLUMNS["2"];
  const gap = ROW_GAP[str(props, "gap")] ?? ROW_GAP.md;
  const renderCol = renderColumn ?? ((column: PageBlock[]) => column.map((block) => <NestedElement key={block.id} block={block} />));
  return (
    <RichSection props={props} widthDefault={1152}>
      <div className={`grid ${gap} ${columns}`}>
        {items.map((column, i) => (
          <div
            key={i}
            className={`flex flex-col gap-4 ${isEditor && column.length === 0 ? "min-h-16 rounded-lg border border-dashed border-line p-2" : ""}`}
          >
            {renderCol(column, i)}
          </div>
        ))}
      </div>
    </RichSection>
  );
}

const GRID_COLUMNS: Record<string, string> = {
  "2": "md:grid-cols-2",
  "3": "sm:grid-cols-2 lg:grid-cols-3",
  "4": "md:grid-cols-2 lg:grid-cols-4",
};

const CARD_GRID_GAP: Record<string, string> = { compact: "gap-3", normal: "gap-6", spacious: "gap-10" };
const CARD_PADDING: Record<string, string> = { compact: "p-4 sm:p-5", normal: "p-6 sm:p-8", spacious: "p-8 sm:p-10" };

export function CardsBlock({ props }: { props: Props }) {
  const items = list(props, "items");
  const withImages = str(props, "style") === "image";
  const columns = GRID_COLUMNS[str(props, "columns")] ?? GRID_COLUMNS["3"];
  const density = str(props, "density") || "normal";
  const gridGap = CARD_GRID_GAP[density] ?? CARD_GRID_GAP.normal;
  const cardPadding = CARD_PADDING[density] ?? CARD_PADDING.normal;
  return (
    <Section props={props}>
      <SectionHeading heading={str(props, "heading")} text={str(props, "text")} />
      <div className={`grid ${gridGap} ${columns}`}>
        {items.map((item, i) => {
          const href = str(item, "href");
          const image = str(item, "image");
          const body = (
            <>
              {withImages && image && (
                <div className="relative aspect-[1200/650] w-full overflow-hidden border-b border-line bg-paper-soft">
                  <BlockImage
                    src={image}
                    alt={str(item, "imageAlt")}
                    sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              )}
              <div className={`flex flex-1 flex-col ${cardPadding}`}>
                {(str(item, "eyebrow") || str(item, "badge")) && (
                  <div className="mb-2 flex items-center justify-between gap-3">
                    {str(item, "eyebrow") && <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{str(item, "eyebrow")}</p>}
                    {str(item, "badge") && (
                      <span className="rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                        {str(item, "badge")}
                      </span>
                    )}
                  </div>
                )}
                <h3 className="font-display text-xl font-semibold">{str(item, "title")}</h3>
                {str(item, "text") && <p className="mt-3 flex-1 whitespace-pre-line text-sm leading-6 text-ink-soft">{str(item, "text")}</p>}
                {href && (
                  <p className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                    {str(item, "linkLabel") || "Learn more"}
                    <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                  </p>
                )}
              </div>
            </>
          );
          const cardClass = `group flex flex-col overflow-hidden rounded-2xl border bg-paper ${
            href
              ? "border-line transition-all duration-300 hover:-translate-y-1 hover:border-ink/40 hover:shadow-[0_16px_32px_-12px_rgba(10,10,10,0.14)]"
              : str(item, "badge")
                ? "border-dashed border-line"
                : "border-line"
          }`;
          return href ? (
            <Link key={i} href={href} className={cardClass}>
              {body}
            </Link>
          ) : (
            <div key={i} className={cardClass}>
              {body}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

export function SplitBlock({ props }: { props: Props }) {
  const image = str(props, "image");
  const tags = str(props, "tags").split("\n").map((t) => t.trim()).filter(Boolean);
  const imageLeft = str(props, "imagePosition") === "left";
  const Heading = str(props, "headingLevel") === "h1" ? "h1" : "h2";
  return (
    <Section props={props}>
      <div className={`grid items-center gap-12 ${image ? "md:grid-cols-[1.1fr_1fr]" : ""}`}>
        <div className={imageLeft && image ? "md:order-2" : ""}>
          {str(props, "eyebrow") && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">{str(props, "eyebrow")}</p>}
          {str(props, "heading") && (
            <Heading className={`font-display font-semibold ${Heading === "h1" ? "text-4xl" : "text-3xl"} ${str(props, "eyebrow") ? "mt-3" : ""}`}>
              {str(props, "heading")}
            </Heading>
          )}
          {str(props, "html") && <div className="page-richtext mt-6 text-ink-soft" dangerouslySetInnerHTML={{ __html: str(props, "html") }} />}
          {tags.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-3">
              {tags.map((tag) => (
                <span key={tag} className="rounded-full border border-ink/15 bg-paper px-5 py-2 text-sm font-medium">
                  {tag}
                </span>
              ))}
            </div>
          )}
          {str(props, "buttonLabel") && (
            <div className="mt-8 flex">
              <ButtonLink href={str(props, "buttonHref")} label={str(props, "buttonLabel")} className={BUTTON_DARK} />
            </div>
          )}
        </div>
        {image && (
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl">
            <BlockImage src={image} alt={str(props, "imageAlt")} sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
          </div>
        )}
      </div>
    </Section>
  );
}

/** A freshly-added Image/Video/Countdown/Custom-design block has no
 * content yet, and the real render for each returns null until it does --
 * right for the public site (no empty band on a live page), wrong for the
 * editor canvas, where that null makes the block invisible and so
 * impossible to click, select or configure. `editorEmpty` opts a call site
 * into this placeholder instead; only the editor's own call sites pass it. */
function EmptyBlockPlaceholder({ text }: { text: string }) {
  return (
    <div className="flex min-h-[96px] items-center justify-center rounded-xl border border-dashed border-line bg-paper-soft px-6 py-8 text-center text-sm text-ink-soft">
      {text}
    </div>
  );
}

export function ImageBlock({
  props,
  nested = false,
  editableText,
  editorEmpty = false,
}: {
  props: Props;
  nested?: boolean;
  editableText?: InlineEdit;
  editorEmpty?: boolean;
}) {
  const image = str(props, "image");
  if (!image) {
    if (!editorEmpty) return null;
    const placeholder = <EmptyBlockPlaceholder text="Click to add an image" />;
    if (nested) return <RichBox props={props}>{placeholder}</RichBox>;
    return (
      <RichSection props={props} widthDefault={896}>
        {placeholder}
      </RichSection>
    );
  }
  const full = str(props, "size") === "full";
  const t = richTextStyle(props);
  const figure = (
    <figure>
      <div className="relative aspect-[1200/650] w-full overflow-hidden rounded-2xl">
        <BlockImage src={image} alt={str(props, "alt")} sizes={nested ? "(min-width: 768px) 33vw, 100vw" : full ? "(min-width: 1152px) 1152px, 100vw" : "(min-width: 896px) 896px, 100vw"} className="object-cover" />
      </div>
      {(str(props, "caption") || editableText) && (
        <figcaption className="mt-3 text-ink-soft" style={t}>
          {editableText ? <InlineTextInput edit={editableText} placeholder="Caption" /> : str(props, "caption")}
        </figcaption>
      )}
    </figure>
  );
  if (nested) return <RichBox props={props}>{figure}</RichBox>;
  return (
    <RichSection props={props} widthDefault={full ? 1152 : 896}>
      {figure}
    </RichSection>
  );
}

function embedUrl(url: string): string | null {
  const youtube = extractYoutubeId(url);
  if (youtube) return `https://www.youtube-nocookie.com/embed/${youtube}`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return vimeo ? `https://player.vimeo.com/video/${vimeo[1]}` : null;
}

export function VideoBlock({
  props,
  nested = false,
  editableText,
  editorEmpty = false,
}: {
  props: Props;
  nested?: boolean;
  editableText?: InlineEdit;
  editorEmpty?: boolean;
}) {
  const src = embedUrl(str(props, "url"));
  if (!src) {
    if (!editorEmpty) return null;
    const placeholder = <EmptyBlockPlaceholder text="Paste a YouTube or Vimeo link" />;
    if (nested) return <RichBox props={props}>{placeholder}</RichBox>;
    return (
      <RichSection props={props} widthDefault={896}>
        {placeholder}
      </RichSection>
    );
  }
  const t = richTextStyle(props);
  const figure = (
    <figure>
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-ink">
        <iframe
          src={src}
          title={str(props, "caption") || "Video"}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
      {(str(props, "caption") || editableText) && (
        <figcaption className="mt-3 text-ink-soft" style={t}>
          {editableText ? <InlineTextInput edit={editableText} placeholder="Caption" /> : str(props, "caption")}
        </figcaption>
      )}
    </figure>
  );
  if (nested) return <RichBox props={props}>{figure}</RichBox>;
  return (
    <RichSection props={props} widthDefault={896}>
      {figure}
    </RichSection>
  );
}

export function CustomCodeBlock({ props, nested = false }: { props: Props; nested?: boolean }) {
  const html = str(props, "html");
  if (!html) return null;
  const content = <div dangerouslySetInnerHTML={{ __html: html }} />;
  if (nested) return <ElementBox props={props}>{content}</ElementBox>;
  return <Section props={props}>{content}</Section>;
}

export function CountdownBlock({ props, nested = false, editorEmpty = false }: { props: Props; nested?: boolean; editorEmpty?: boolean }) {
  const target = str(props, "target");
  if (!target) {
    if (!editorEmpty) return null;
    const placeholder = <EmptyBlockPlaceholder text="Set a countdown date in the panel on the right" />;
    if (nested) return <RichBox props={props}>{placeholder}</RichBox>;
    return (
      <RichSection props={props} widthDefault={672}>
        {placeholder}
      </RichSection>
    );
  }
  const t = richTextStyle(props);
  const content = (
    <div className="flex flex-col items-center gap-6">
      {str(props, "heading") && (
        <h2 className="font-display" style={t}>
          {str(props, "heading")}
        </h2>
      )}
      <CountdownTimer
        target={target}
        expiredText={str(props, "expiredText")}
        labels={{ days: "Days", hours: "Hours", minutes: "Min", seconds: "Sec" }}
      />
      {str(props, "buttonLabel") && (
        <ButtonLink href={str(props, "buttonHref")} label={str(props, "buttonLabel")} className={BUTTON_DARK} />
      )}
    </div>
  );
  if (nested) return <RichBox props={props}>{content}</RichBox>;
  return (
    <RichSection props={props} widthDefault={672}>
      {content}
    </RichSection>
  );
}

export function CtaBlock({ props }: { props: Props }) {
  const primaryLabel = str(props, "buttonLabel");
  const buttonAction = str(props, "buttonAction");
  const formPopupId = buttonAction === "formPopup" ? Number(str(props, "buttonFormId")) || 0 : 0;
  const buttons = (light: boolean) => (
    <div className="flex flex-col gap-3 sm:flex-row">
      {formPopupId && primaryLabel ? (
        <SavedFormPopup
          formId={formPopupId}
          buttonLabel={primaryLabel}
          buttonClassName={light ? "rounded-full bg-paper px-6 py-3 text-center text-sm font-medium text-ink transition-opacity hover:opacity-80" : BUTTON_DARK}
        />
      ) : (
        <ButtonLink
          href={str(props, "buttonHref")}
          label={primaryLabel}
          className={light ? "rounded-full bg-paper px-6 py-3 text-center text-sm font-medium text-ink transition-opacity hover:opacity-80" : BUTTON_DARK}
        />
      )}
      <ButtonLink
        href={str(props, "secondaryHref")}
        label={str(props, "secondaryLabel")}
        className={light ? "rounded-full border border-white/30 px-6 py-3 text-center text-sm font-medium text-paper hover:border-white" : BUTTON_OUTLINE}
      />
    </div>
  );
  if (str(props, "style") === "card") {
    return (
      <Section props={props}>
        <div className="flex flex-col items-start gap-6 rounded-2xl bg-ink-gradient p-10 text-paper md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="font-display text-2xl font-semibold">{str(props, "heading")}</h2>
            {str(props, "text") && <p className="mt-2 whitespace-pre-line text-white/70">{str(props, "text")}</p>}
          </div>
          {buttons(true)}
        </div>
      </Section>
    );
  }
  return (
    <section id={str(props, "anchor") || undefined} className={`border-t border-line ${str(props, "background") === "dark" ? "page-section-dark" : "bg-paper-gradient"}`}>
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-6 py-24 md:flex-row md:items-center md:justify-between">
        <div className="max-w-lg">
          <h2 className="text-balance font-display text-3xl font-semibold">{str(props, "heading")}</h2>
          {str(props, "text") && <p className="mt-3 whitespace-pre-line text-ink-soft">{str(props, "text")}</p>}
        </div>
        {buttons(false)}
      </div>
    </section>
  );
}

export function FaqBlock({ props }: { props: Props }) {
  const items = list(props, "items").filter((i) => str(i, "question"));
  if (!items.length) return null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: str(i, "question"), acceptedAnswer: { "@type": "Answer", text: str(i, "answer") } })),
  };
  return (
    <RichSection props={props} widthDefault={768}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      {str(props, "heading") && <h2 className="mb-8 font-display text-3xl font-semibold">{str(props, "heading")}</h2>}
      <div className="divide-y divide-line border-y border-line">
        {items.map((item, i) => (
          <details key={i} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-ink">
              {str(item, "question")}
              <span aria-hidden="true" className="text-xl text-ink-soft transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-ink-soft">{str(item, "answer")}</p>
          </details>
        ))}
      </div>
    </RichSection>
  );
}

export function StatsBlock({ props }: { props: Props }) {
  const items = list(props, "items");
  return (
    <RichSection props={props} widthDefault={1152}>
      <SectionHeading heading={str(props, "heading")} />
      <dl className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item, i) => (
          <div key={i} className="flex flex-col-reverse border-l border-line pl-6">
            <dt className="mt-2 text-sm text-ink-soft">{str(item, "label")}</dt>
            <dd className="font-display text-4xl font-semibold">{str(item, "value")}</dd>
          </div>
        ))}
      </dl>
    </RichSection>
  );
}

function CardGridLink({ href, image, title, text }: { href: string; image: string | null; title: string; text: string | null }) {
  return (
    <Link href={href} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-paper">
      {image && (
        <div className="relative aspect-[1200/650] w-full overflow-hidden border-b border-line bg-paper-soft">
          <BlockImage src={image} alt={title} sizes="(min-width: 768px) 33vw, 100vw" className="object-cover transition-transform duration-300 group-hover:scale-105" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-6">
        <h3 className="font-display text-lg font-semibold leading-snug">{title}</h3>
        {text && <p className="line-clamp-2 text-sm text-ink-soft">{text}</p>}
      </div>
    </Link>
  );
}

export function LatestPostsView({ props, posts, editorEmpty = false }: { props: Props; posts: BlogIndexEntry[]; editorEmpty?: boolean }) {
  const visible = posts.slice(0, num(props, "count", 3));
  if (!visible.length) {
    if (!editorEmpty) return null;
    return (
      <Section props={props}>
        <SectionHeading heading={str(props, "heading")} link={{ href: "/blog", label: str(props, "linkLabel") }} />
        <EmptyBlockPlaceholder text="No published blog posts yet -- this will fill in once you have some" />
      </Section>
    );
  }
  return (
    <Section props={props}>
      <SectionHeading heading={str(props, "heading")} link={{ href: "/blog", label: str(props, "linkLabel") }} />
      <div className="grid gap-8 md:grid-cols-3">
        {visible.map((post) => (
          <CardGridLink key={post.slug} href={`/blog/${post.slug}`} image={resolveImage(post.feature_image)} title={post.title} text={post.excerpt} />
        ))}
      </div>
    </Section>
  );
}

export type CourseSummary = { slug: string; title: string; description: string | null; cover_image_url: string | null };

export function LatestCoursesView({ props, courses, editorEmpty = false }: { props: Props; courses: CourseSummary[]; editorEmpty?: boolean }) {
  const visible = courses.slice(0, num(props, "count", 3));
  if (!visible.length) {
    if (!editorEmpty) return null;
    return (
      <Section props={props}>
        <SectionHeading heading={str(props, "heading")} link={{ href: "/courses", label: str(props, "linkLabel") }} />
        <EmptyBlockPlaceholder text="No published courses yet -- this will fill in once you have some" />
      </Section>
    );
  }
  return (
    <Section props={props}>
      <SectionHeading heading={str(props, "heading")} link={{ href: "/courses", label: str(props, "linkLabel") }} />
      <div className="grid gap-8 md:grid-cols-3">
        {visible.map((course) => (
          <CardGridLink key={course.slug} href={`/courses/${course.slug}`} image={course.cover_image_url} title={course.title} text={course.description} />
        ))}
      </div>
    </Section>
  );
}

export function ReviewsView({ props, reviewers, editorEmpty = false }: { props: Props; reviewers: Reviewer[]; editorEmpty?: boolean }) {
  const latest = reviewers.slice(0, num(props, "count", 3));
  if (!latest.length) {
    if (!editorEmpty) return null;
    return (
      <Section props={props}>
        <SectionHeading heading={str(props, "heading")} link={{ href: "/reviews", label: str(props, "linkLabel") }} />
        <EmptyBlockPlaceholder text="No published reviews yet -- this will fill in once you have some" />
      </Section>
    );
  }
  return (
    <Section props={props}>
      <SectionHeading heading={str(props, "heading")} link={{ href: "/reviews", label: str(props, "linkLabel") }} />
      <div className="grid gap-8 md:grid-cols-3">
        {latest.map((review) => (
          <div key={review.slug} className="flex flex-col gap-4 rounded-2xl border border-line bg-paper p-6">
            <div className="flex items-center gap-4">
              {review.avatar ? (
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-line">
                  <BlockImage src={review.avatar} alt={review.name} sizes="48px" className="object-cover" />
                </div>
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-paper-gradient text-lg font-semibold">
                  {review.name.charAt(0)}
                </div>
              )}
              <div>
                <h3 className="font-semibold">{review.name}</h3>
                <p className="text-sm text-ink-soft">{review.role}</p>
              </div>
            </div>
            <p className="text-sm italic leading-relaxed text-ink-soft">
              &quot;{review.text.length > 150 ? review.text.slice(0, 150) + "..." : review.text}&quot;
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function WorkflowDemoBlock({ props }: { props: Props }) {
  return (
    <Section props={props}>
      <SectionHeading heading={str(props, "heading")} text={str(props, "text")} />
      <WorkflowDemo />
    </Section>
  );
}

export function IntegrationsBlock({ props }: { props: Props }) {
  return (
    <Section props={props}>
      <SectionHeading heading={str(props, "heading")} text={str(props, "text")} />
      <IntegrationIcons />
    </Section>
  );
}

export function FeaturedOnBlock({ props, editorEmpty = false }: { props: Props; editorEmpty?: boolean }) {
  const items = list(props, "items").map((item) => ({
    href: str(item, "href"),
    badge: str(item, "badge"),
    width: typeof item.width === "number" ? item.width : 200,
    height: typeof item.height === "number" ? item.height : 60,
    alt: str(item, "alt"),
  }));
  return <FeaturedOn heading={str(props, "heading")} listings={items} editorEmpty={editorEmpty} />;
}

export function ContactDetailsBlock({ props, business }: { props: Props; business: ResolvedBusiness }) {
  return (
    <Section props={props} width="max-w-3xl">
      {str(props, "heading") && <h2 className="mb-6 font-display text-2xl font-semibold">{str(props, "heading")}</h2>}
      <BusinessContactDetails business={business} />
    </Section>
  );
}

const SOCIAL_ICON_PATHS: Record<string, string> = {
  x: "M4 3l7.3 9.6L4.4 21h2.1l6-6.9 4.5 6.9H21l-7.6-10L20 3h-2.1l-5.5 6.3L8.4 3H4z",
  youtube:
    "M22 12s0-3.2-.4-4.7a2.9 2.9 0 0 0-2-2.1C17.9 4.8 12 4.8 12 4.8s-5.9 0-7.6.4a2.9 2.9 0 0 0-2 2C2 8.8 2 12 2 12s0 3.2.4 4.7a2.9 2.9 0 0 0 2 2.1c1.7.4 7.6.4 7.6.4s5.9 0 7.6-.4a2.9 2.9 0 0 0 2-2 17 17 0 0 0 .4-4.8ZM10 15.3V8.7l6 3.3Z",
  linkedin:
    "M6.9 8.4H3.6V20h3.3zM5.3 3.6a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8ZM20.4 20v-6.4c0-3.4-1.8-5-4.3-5a3.7 3.7 0 0 0-3.3 1.8V8.4H9.4c0 .9 0 9.9 0 11.6h3.4v-6.5c0-.3 0-.7.1-1 .3-.7 1-1.4 2-1.4 1.5 0 2.1 1.1 2.1 2.8V20Z",
  facebook:
    "M13.5 21v-8h2.7l.4-3.1h-3.1V8c0-.9.25-1.5 1.53-1.5H16.7V3.7C16.4 3.66 15.4 3.57 14.2 3.57c-2.4 0-4 1.46-4 4.15V9.9H7.5V13h2.7v8h3.3z",
  tiktok:
    "M16.6 3h-3.1v12.3a2.7 2.7 0 1 1-2.7-2.7c.3 0 .6 0 .8.1V9.5a5.9 5.9 0 1 0 5 5.8V9.1a7.6 7.6 0 0 0 4.4 1.4V7.4a4.4 4.4 0 0 1-4.4-4.4Z",
  github:
    "M12 2.3a9.8 9.8 0 0 0-3.1 19.1c.5.1.7-.2.7-.5v-1.7c-2.7.6-3.3-1.3-3.3-1.3-.4-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.2-4.5-1.1-4.5-4.9 0-1.1.4-2 1-2.6-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.3 9.3 0 0 1 4.9 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.6.6.7 1 1.5 1 2.6 0 3.8-2.3 4.6-4.5 4.9.4.3.7.9.7 1.8v2.7c0 .3.2.6.7.5A9.8 9.8 0 0 0 12 2.3Z",
};

function SocialPlatformIcon({ platform }: { platform: string }) {
  const filled = SOCIAL_ICON_PATHS[platform];
  if (filled) {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[55%] w-[55%]" fill="currentColor">
        <path d={filled} />
      </svg>
    );
  }
  // instagram: an outline mark, not a filled path like the others.
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[55%] w-[55%]" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

const SOCIAL_ICON_SIZE: Record<string, string> = { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-12 w-12" };
const SOCIAL_ALIGN: Record<string, string> = { left: "justify-start", center: "justify-center", right: "justify-end" };

export function SocialIconsBlock({ props, nested = false }: { props: Props; nested?: boolean }) {
  const items = list(props, "items").filter((i) => str(i, "href") && str(i, "platform"));
  if (!items.length) return null;
  const size = SOCIAL_ICON_SIZE[str(props, "size")] ?? SOCIAL_ICON_SIZE.md;
  const align = SOCIAL_ALIGN[str(props, "align")] ?? SOCIAL_ALIGN.left;
  const content = (
    <div className={`flex flex-wrap items-center gap-3 ${align}`}>
      {items.map((item, i) => (
        <a
          key={i}
          href={str(item, "href")}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={str(item, "platform")}
          className={`flex shrink-0 items-center justify-center rounded-full border border-line text-ink-soft transition-colors hover:border-ink hover:text-ink ${size}`}
        >
          <SocialPlatformIcon platform={str(item, "platform")} />
        </a>
      ))}
    </div>
  );
  if (nested) return <RichBox props={props}>{content}</RichBox>;
  return (
    <RichSection props={props} widthDefault={720}>
      {content}
    </RichSection>
  );
}

/** Just the form. It used to be able to staple a business-details sidebar
 * onto itself, which was a hardcoded second layout nobody could edit -- and
 * redundant, since "Contact details" is its own block and a Row with two
 * columns puts anything at all beside a form. */
export function FormBlock({
  props,
  form,
  preview = false,
}: {
  props: Props;
  form?: React.ComponentProps<typeof SavedFormBlock>["initialForm"];
  /** Set by the page editor's canvas -- see SavedForm's `preview`. */
  preview?: boolean;
}) {
  const formId = Number(str(props, "savedFormId")) || 0;
  return (
    <RichSection props={props} widthDefault={672}>
      <SavedFormBlock formId={formId} initialForm={form} preview={preview} designOverride={{
        ...(str(props, "formBackgroundColor") ? { backgroundColor: str(props, "formBackgroundColor") } : {}),
        ...(str(props, "formTextColor") ? { textColor: str(props, "formTextColor") } : {}),
        ...(str(props, "formFieldBorderColor") ? { borderColor: str(props, "formFieldBorderColor") } : {}),
        ...(str(props, "formButtonColor") ? { buttonColor: str(props, "formButtonColor") } : {}),
        ...(str(props, "formButtonTextColor") ? { buttonTextColor: str(props, "formButtonTextColor") } : {}),
      }} />
    </RichSection>
  );
}

export function BusinessDetailsBlock({ props, business }: { props: Props; business: ResolvedBusiness }) {
  const facts: { label: string; value: string }[] = [
    ...list(props, "items").map((i) => ({ label: str(i, "label"), value: str(i, "value") })),
    ...(bool(props, "showOwner") && business.ownerName ? [{ label: "Owner", value: business.ownerName }] : []),
    ...(bool(props, "showRegistration") && business.registrationNumber
      ? [{ label: business.registrationLabel || "Registration", value: business.registrationNumber }]
      : []),
    ...(bool(props, "showAddress") && business.addressOneLine ? [{ label: "Registered address", value: business.addressOneLine }] : []),
  ].filter((f) => f.label && f.value);
  const intro = str(props, "intro") || business.legalLine;
  if (!facts.length && !intro) return null;
  return (
    <Section props={props}>
      <div className="border-t border-line pt-12">
        {str(props, "heading") && <h2 className="font-display text-2xl font-semibold">{str(props, "heading")}</h2>}
        {intro && <p className="mt-3 max-w-3xl whitespace-pre-line text-ink-soft">{intro}</p>}
        {facts.length > 0 && (
          <dl className="mt-6 grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="font-medium text-ink">{fact.label}</dt>
                <dd className="mt-1 text-ink-soft">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {bool(props, "showContactLink") && (
          <p className="mt-6 text-sm text-ink-soft">
            Questions? See{" "}
            <Link href="/contact" className="text-ink underline">
              Contact Us
            </Link>{" "}
            for email, phone and business hours.
          </p>
        )}
      </div>
    </Section>
  );
}

const SPACER: Record<string, string> = { sm: "h-6", md: "h-12", lg: "h-24" };

export function SpacerBlock({ props }: { props: Props }) {
  return (
    <div className={`mx-auto flex max-w-6xl items-center px-6 ${SPACER[str(props, "size")] ?? SPACER.md}`}>
      {bool(props, "divider") && <hr className="w-full border-line" />}
    </div>
  );
}

// --- Rich-model element library (30+ real elements) --------------------

export function DividerBlock({ props, nested = false }: { props: Props; nested?: boolean }) {
  const content = <hr style={{ borderTopWidth: `${num(props, "thickness", 1)}px`, borderColor: str(props, "lineColor") || undefined }} className="w-full border-line" />;
  if (nested) return <RichBox props={props}>{content}</RichBox>;
  return (
    <RichSection props={props} widthDefault={1152}>
      {content}
    </RichSection>
  );
}

export function ListBlock({ props, nested = false }: { props: Props; nested?: boolean }) {
  const items = list(props, "items").filter((i) => str(i, "text"));
  if (!items.length) return null;
  const styleKind = str(props, "style") || "bullet";
  const Glyph = ICON_COMPONENTS[str(props, "icon")] ?? CheckCircle;
  const t = richTextStyle(props);
  const content =
    styleKind === "number" ? (
      <ol className="list-decimal space-y-2 pl-5">
        {items.map((item, i) => (
          <li key={i} style={t}>
            {str(item, "text")}
          </li>
        ))}
      </ol>
    ) : styleKind === "icon" ? (
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5" style={t}>
            <Glyph className="mt-0.5 h-[1em] w-[1em] shrink-0" strokeWidth={2} />
            <span>{str(item, "text")}</span>
          </li>
        ))}
      </ul>
    ) : (
      <ul className="list-disc space-y-2 pl-5">
        {items.map((item, i) => (
          <li key={i} style={t}>
            {str(item, "text")}
          </li>
        ))}
      </ul>
    );
  if (nested) return <RichBox props={props}>{content}</RichBox>;
  return (
    <RichSection props={props} widthDefault={640}>
      {content}
    </RichSection>
  );
}

export function TestimonialBlock({ props, nested = false }: { props: Props; nested?: boolean }) {
  const quote = str(props, "quote");
  if (!quote) return null;
  const avatar = str(props, "avatar");
  const t = richTextStyle(props);
  const content = (
    <figure className="flex flex-col items-center text-center">
      <blockquote style={t}>&ldquo;{quote}&rdquo;</blockquote>
      <figcaption className="mt-4 flex flex-col items-center gap-2">
        {avatar && (
          <div className="relative h-12 w-12 overflow-hidden rounded-full">
            <BlockImage src={avatar} alt={str(props, "name")} sizes="48px" className="object-cover" />
          </div>
        )}
        <div>
          {str(props, "name") && <div className="font-medium text-ink">{str(props, "name")}</div>}
          {str(props, "role") && <div className="text-sm text-ink-soft">{str(props, "role")}</div>}
        </div>
      </figcaption>
    </figure>
  );
  if (nested) return <RichBox props={props}>{content}</RichBox>;
  return (
    <RichSection props={props} widthDefault={640}>
      {content}
    </RichSection>
  );
}

export function RatingBlock({ props, nested = false }: { props: Props; nested?: boolean }) {
  const value = num(props, "value", 5);
  const t = richTextStyle(props);
  const content = (
    <div className="flex flex-col items-center gap-2" style={{ textAlign: t.textAlign }}>
      <div className="flex gap-0.5 text-amber-400">
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className="h-5 w-5" strokeWidth={1.75} fill={i < value ? "currentColor" : "none"} />
        ))}
      </div>
      {str(props, "label") && (
        <span style={{ fontSize: t.fontSize, fontWeight: t.fontWeight, color: t.color }}>{str(props, "label")}</span>
      )}
    </div>
  );
  if (nested) return <RichBox props={props}>{content}</RichBox>;
  return (
    <RichSection props={props} widthDefault={320}>
      {content}
    </RichSection>
  );
}

const ALERT_STYLE: Record<string, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-900",
  success: "border-green-200 bg-green-50 text-green-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
};

export function AlertBlock({ props, nested = false }: { props: Props; nested?: boolean }) {
  const text = str(props, "text");
  if (!text) return null;
  const tone = ALERT_STYLE[str(props, "style")] ?? ALERT_STYLE.info;
  const content = <div className={`rounded-xl border px-4 py-3 text-sm ${tone}`}>{text}</div>;
  if (nested) return <RichBox props={props}>{content}</RichBox>;
  return (
    <RichSection props={props} widthDefault={768}>
      {content}
    </RichSection>
  );
}

export function BlockquoteBlock({ props, nested = false }: { props: Props; nested?: boolean }) {
  const quote = str(props, "quote");
  if (!quote) return null;
  const t = richTextStyle(props);
  const content = (
    <blockquote className="border-l-4 border-ink pl-5 font-display" style={t}>
      {quote}
      {str(props, "cite") && <footer className="mt-2 text-sm font-normal text-ink-soft">— {str(props, "cite")}</footer>}
    </blockquote>
  );
  if (nested) return <RichBox props={props}>{content}</RichBox>;
  return (
    <RichSection props={props} widthDefault={640}>
      {content}
    </RichSection>
  );
}

export function TableBlock({ props, nested = false }: { props: Props; nested?: boolean }) {
  const rows = list(props, "rows")
    .map((r) => str(r, "cells").split("|").map((c) => c.trim()))
    .filter((r) => r.some(Boolean));
  if (!rows.length) return null;
  const header = str(props, "header");
  const headerCells = header ? header.split("|").map((c) => c.trim()) : null;
  const content = (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-left text-sm">
        {headerCells && (
          <thead>
            <tr className="border-b border-line bg-paper-soft">
              {headerCells.map((c, i) => (
                <th key={i} className="px-4 py-2.5 font-medium text-ink">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i > 0 ? "border-t border-line" : ""}>
              {r.map((c, j) => (
                <td key={j} className="px-4 py-2.5 text-ink-soft">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  if (nested) return <RichBox props={props}>{content}</RichBox>;
  return (
    <RichSection props={props} widthDefault={896}>
      {content}
    </RichSection>
  );
}

export function ProgressBlock({ props, nested = false }: { props: Props; nested?: boolean }) {
  const items = list(props, "items").filter((i) => str(i, "label"));
  if (!items.length) return null;
  const content = (
    <div className="flex flex-col gap-4">
      {items.map((item, i) => {
        const value = Math.min(100, Math.max(0, num(item, "value", 0)));
        return (
          <div key={i}>
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="font-medium text-ink">{str(item, "label")}</span>
              <span className="text-ink-soft">{value}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-paper-soft">
              <div className="h-full rounded-full bg-ink" style={{ width: `${value}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
  if (nested) return <RichBox props={props}>{content}</RichBox>;
  return (
    <RichSection props={props} widthDefault={480}>
      {content}
    </RichSection>
  );
}

export function PriceTableBlock({ props, nested = false }: { props: Props; nested?: boolean }) {
  const planName = str(props, "planName");
  if (!planName) return null;
  const highlighted = bool(props, "highlighted");
  const features = list(props, "features").filter((f) => str(f, "text"));
  const content = (
    <div className={`rounded-2xl border p-8 text-center ${highlighted ? "border-ink shadow-lg" : "border-line"}`}>
      <div className="font-display text-lg font-semibold">{planName}</div>
      <div className="mt-3">
        <span className="font-display text-4xl font-semibold">{str(props, "price")}</span>
        {str(props, "period") && <span className="text-ink-soft">{str(props, "period")}</span>}
      </div>
      {features.length > 0 && (
        <ul className="mt-6 space-y-2 text-left text-sm">
          {features.map((f, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" />
              {str(f, "text")}
            </li>
          ))}
        </ul>
      )}
      {str(props, "buttonLabel") && str(props, "buttonHref") && (
        <div className="mt-6">
          <ButtonLink href={str(props, "buttonHref")} label={str(props, "buttonLabel")} className={highlighted ? BUTTON_DARK : BUTTON_OUTLINE} />
        </div>
      )}
    </div>
  );
  if (nested) return <RichBox props={props}>{content}</RichBox>;
  return (
    <RichSection props={props} widthDefault={360}>
      {content}
    </RichSection>
  );
}

export function TeamMemberBlock({ props, nested = false }: { props: Props; nested?: boolean }) {
  const name = str(props, "name");
  if (!name) return null;
  const photo = str(props, "photo");
  const href = str(props, "href");
  const t = richTextStyle(props);
  const inner = (
    <div className="flex flex-col items-center" style={{ textAlign: t.textAlign }}>
      {photo && (
        <div className="relative h-24 w-24 overflow-hidden rounded-full">
          <BlockImage src={photo} alt={name} sizes="96px" className="object-cover" />
        </div>
      )}
      <div className="mt-4 font-display font-semibold">{name}</div>
      {str(props, "role") && <div className="text-sm text-ink-soft">{str(props, "role")}</div>}
      {str(props, "bio") && <p className="mt-2 text-sm text-ink-soft">{str(props, "bio")}</p>}
    </div>
  );
  const content = href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
  if (nested) return <RichBox props={props}>{content}</RichBox>;
  return (
    <RichSection props={props} widthDefault={320}>
      {content}
    </RichSection>
  );
}

export function StepsBlock({ props, nested = false }: { props: Props; nested?: boolean }) {
  const items = list(props, "items").filter((i) => str(i, "title"));
  if (!items.length) return null;
  const content = (
    <ol className="flex flex-col gap-6">
      {items.map((item, i) => (
        <li key={i} className="flex gap-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink font-display text-sm font-semibold text-paper">
            {i + 1}
          </span>
          <div>
            <div className="font-medium text-ink">{str(item, "title")}</div>
            {str(item, "text") && <p className="mt-1 text-sm text-ink-soft">{str(item, "text")}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
  if (nested) return <RichBox props={props}>{content}</RichBox>;
  return (
    <RichSection props={props} widthDefault={640}>
      {content}
    </RichSection>
  );
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

/** No client-side JS: a hidden radio per tab (checked state picks which
 * panel shows) plus a handful of plain CSS rules scoped to this block's
 * own id prefix, injected as a `<style>` tag -- the same reasoning
 * CustomBlock's own scoped CSS uses, just generated here instead of
 * hand-written. `name` is derived from the tab labels so two Tabs blocks
 * on one page don't share a radio group (and so panels stay in sync
 * across server/editor re-renders of the same content). */
export function TabsBlock({ props, nested = false }: { props: Props; nested?: boolean }) {
  const items = list(props, "items").filter((i) => str(i, "label"));
  if (!items.length) return null;
  const name = `tabs-${simpleHash(items.map((i) => str(i, "label")).join("|"))}`;
  const css = items
    .map(
      (_, i) =>
        `#${name}-${i}:checked ~ .${name}-panels .${name}-panel:nth-of-type(${i + 1}) { display: block; }\n` +
        `#${name}-${i}:checked ~ .${name}-tabs label:nth-of-type(${i + 1}) { color: #0a0a0a; border-color: #0a0a0a; }`
    )
    .join("\n");
  const content = (
    <div>
      {items.map((_, i) => (
        <input key={i} type="radio" name={name} id={`${name}-${i}`} defaultChecked={i === 0} className="sr-only" />
      ))}
      <div className={`${name}-tabs flex flex-wrap gap-1 border-b border-line`}>
        {items.map((item, i) => (
          <label
            key={i}
            htmlFor={`${name}-${i}`}
            className="cursor-pointer rounded-t-lg border-b-2 border-transparent px-4 py-2 text-sm font-medium text-ink-soft hover:text-ink"
          >
            {str(item, "label")}
          </label>
        ))}
      </div>
      <div className={`${name}-panels pt-4`}>
        {items.map((item, i) => (
          <div key={i} className={`${name}-panel page-richtext hidden`} dangerouslySetInnerHTML={{ __html: str(item, "html") }} />
        ))}
      </div>
      <style dangerouslySetInnerHTML={{ __html: css }} />
    </div>
  );
  if (nested) return <RichBox props={props}>{content}</RichBox>;
  return (
    <RichSection props={props} widthDefault={768}>
      {content}
    </RichSection>
  );
}

export function MapBlock({ props, nested = false, editorEmpty = false }: { props: Props; nested?: boolean; editorEmpty?: boolean }) {
  const address = str(props, "address");
  if (!address) {
    if (!editorEmpty) return null;
    const placeholder = <EmptyBlockPlaceholder text="Add an address in the panel on the right" />;
    if (nested) return <RichBox props={props}>{placeholder}</RichBox>;
    return (
      <RichSection props={props} widthDefault={896}>
        {placeholder}
      </RichSection>
    );
  }
  const content = (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl">
      <iframe
        src={`https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
        title={address}
        className="absolute inset-0 h-full w-full border-0"
        loading="lazy"
      />
    </div>
  );
  if (nested) return <RichBox props={props}>{content}</RichBox>;
  return (
    <RichSection props={props} widthDefault={896}>
      {content}
    </RichSection>
  );
}

export function EmbedBlock({ props, nested = false, editorEmpty = false }: { props: Props; nested?: boolean; editorEmpty?: boolean }) {
  const code = str(props, "code");
  if (!code) {
    if (!editorEmpty) return null;
    const placeholder = <EmptyBlockPlaceholder text="Paste embed code in the panel on the right" />;
    if (nested) return <RichBox props={props}>{placeholder}</RichBox>;
    return (
      <RichSection props={props} widthDefault={896}>
        {placeholder}
      </RichSection>
    );
  }
  const content = <div dangerouslySetInnerHTML={{ __html: code }} />;
  if (nested) return <RichBox props={props}>{content}</RichBox>;
  return (
    <RichSection props={props} widthDefault={896}>
      {content}
    </RichSection>
  );
}

export function BreadcrumbsBlock({ props, nested = false }: { props: Props; nested?: boolean }) {
  const items = list(props, "items").filter((i) => str(i, "label"));
  if (!items.length) return null;
  const t = richTextStyle(props);
  const content = (
    <nav aria-label="Breadcrumb" style={{ fontSize: t.fontSize, color: t.color }}>
      <ol className="flex flex-wrap items-center gap-1.5 text-ink-soft">
        {items.map((item, i) => {
          const href = str(item, "href");
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5">
              {href && !isLast ? (
                <Link href={href} className="hover:text-ink">
                  {str(item, "label")}
                </Link>
              ) : (
                <span className={isLast ? "text-ink" : undefined}>{str(item, "label")}</span>
              )}
              {!isLast && <span aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
  if (nested) return <RichBox props={props}>{content}</RichBox>;
  return (
    <RichSection props={props} widthDefault={1152}>
      {content}
    </RichSection>
  );
}

export function AudioBlock({ props, nested = false, editorEmpty = false }: { props: Props; nested?: boolean; editorEmpty?: boolean }) {
  const url = str(props, "url");
  if (!url) {
    if (!editorEmpty) return null;
    const placeholder = <EmptyBlockPlaceholder text="Add an audio file URL in the panel on the right" />;
    if (nested) return <RichBox props={props}>{placeholder}</RichBox>;
    return (
      <RichSection props={props} widthDefault={480}>
        {placeholder}
      </RichSection>
    );
  }
  const content = (
    <figure>
      <audio controls src={url} className="w-full" />
      {str(props, "caption") && <figcaption className="mt-2 text-center text-sm text-ink-soft">{str(props, "caption")}</figcaption>}
    </figure>
  );
  if (nested) return <RichBox props={props}>{content}</RichBox>;
  return (
    <RichSection props={props} widthDefault={480}>
      {content}
    </RichSection>
  );
}

export function LogoBlock({ props, nested = false, editorEmpty = false }: { props: Props; nested?: boolean; editorEmpty?: boolean }) {
  const image = str(props, "image");
  if (!image) {
    if (!editorEmpty) return null;
    const placeholder = <EmptyBlockPlaceholder text="Click to add a logo image" />;
    if (nested) return <RichBox props={props}>{placeholder}</RichBox>;
    return (
      <RichSection props={props} widthDefault={160}>
        {placeholder}
      </RichSection>
    );
  }
  const href = str(props, "href");
  const figure = (
    <div className="relative h-16 w-full">
      <BlockImage src={image} alt={str(props, "alt")} sizes="160px" className="object-contain" />
    </div>
  );
  const content = href ? (
    <Link href={href} className="block">
      {figure}
    </Link>
  ) : (
    figure
  );
  if (nested) return <RichBox props={props}>{content}</RichBox>;
  return (
    <RichSection props={props} widthDefault={160}>
      {content}
    </RichSection>
  );
}
