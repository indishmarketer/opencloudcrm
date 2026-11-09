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
import NewsletterSignupForm from "@/components/NewsletterSignupForm";
import CountdownTimer from "@/components/CountdownTimer";
import BusinessContactDetails from "@/components/BusinessContactDetails";
import BlockImage from "@/components/pageBlocks/BlockImage";
import ContactFormBlock from "@/components/pageBlocks/ContactFormBlock";

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
const TEXT_ALIGN: Record<string, string> = { left: "text-left", center: "text-center", right: "text-right" };
const FONT_SIZE: Record<string, string> = { sm: "text-sm", lg: "text-lg", xl: "text-xl", "2xl": "text-2xl", "3xl": "text-3xl" };
const FONT_WEIGHT: Record<string, string> = { normal: "font-normal", medium: "font-medium", semibold: "font-semibold", bold: "font-bold" };

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

/** Text alignment/size/weight/color overrides, for the simple single-text
 * element blocks where applying them unambiguously makes sense (unlike a
 * multi-part section such as Cards or Hero).
 *
 * `defaults` is the class a caller would otherwise hard-code for that same
 * property (Heading's level-based size, Button's `text-sm text-center`...).
 * It's resolved here -- override-or-default, exactly one class per
 * property -- rather than left for the caller to concatenate both and
 * hope. Two Tailwind classes for the same CSS property (the component's
 * own default alongside the Style tab's override) both have equal
 * selector specificity, so whichever Tailwind happens to emit LATER in
 * its generated stylesheet wins -- a position decided by Tailwind's own
 * internal class order, not by where either class sits in this string.
 * For Heading, whose only default is a font-size class, that meant a
 * smaller Style-tab size could silently lose to the larger default every
 * time. Resolving the winner in JS instead removes the ambiguity. */
function textStyleAttrs(
  props: Props,
  defaults: { align?: string; size?: string; weight?: string } = {}
): { className: string; style: React.CSSProperties } {
  const align = TEXT_ALIGN[str(props, "textAlign")] || defaults.align || "";
  const size = FONT_SIZE[str(props, "fontSize")] || defaults.size || "";
  const weight = FONT_WEIGHT[str(props, "fontWeight")] || defaults.weight || "";
  const className = [align, size, weight].filter(Boolean).join(" ");
  const textColor = str(props, "textColor");
  return { className, style: textColor ? { color: textColor } : {} };
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
      className={`border-none bg-transparent p-0 outline-none ${autoWidth ? "" : "w-full"} ${className || ""}`.trim()}
      style={style}
    />
  );
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
  const guide = str(props, "primaryAction") === "leadMagnet" ? activeLeadMagnet : null;
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

export function RichTextBlock({ props, nested = false }: { props: Props; nested?: boolean }) {
  const t = textStyleAttrs(props);
  const content = (
    <div className={`page-richtext text-ink-soft ${t.className}`.trim()} style={t.style} dangerouslySetInnerHTML={{ __html: str(props, "html") }} />
  );
  if (nested) return <ElementBox props={props}>{content}</ElementBox>;
  return (
    <Section props={props} width={str(props, "width") === "wide" ? "max-w-6xl" : "max-w-3xl"}>
      {content}
    </Section>
  );
}

export function HeadingBlock({ props, nested = false, editableText }: { props: Props; nested?: boolean; editableText?: InlineEdit }) {
  const text = str(props, "text");
  if (!text && !editableText) return null;
  const level = str(props, "level");
  const Heading = (level === "h3" ? "h3" : level === "h4" ? "h4" : "h2") as "h2" | "h3" | "h4";
  const baseSize = level === "h3" ? "text-2xl" : level === "h4" ? "text-xl" : "text-3xl";
  const t = textStyleAttrs(props, { size: baseSize });
  const el = (
    <Heading className={`font-display font-semibold ${t.className}`.trim()} style={t.style}>
      {editableText ? <InlineTextInput edit={editableText} placeholder="Heading text" /> : text}
    </Heading>
  );
  if (nested) return <ElementBox props={props}>{el}</ElementBox>;
  return (
    <Section props={props} width="max-w-3xl">
      {el}
    </Section>
  );
}

export function ButtonBlock({ props, nested = false, editableText }: { props: Props; nested?: boolean; editableText?: InlineEdit }) {
  const label = str(props, "label");
  const href = str(props, "href");
  if ((!label || !href) && !editableText) return null;
  // "align" (this block's own content field) positions the button within
  // its box -- left/center/right -- a different concern from the Style
  // tab's textAlign, which would only affect how the label's own text
  // wraps inside the button and is folded into `t.className` below.
  const alignClass = str(props, "align") === "center" ? "justify-center" : str(props, "align") === "right" ? "justify-end" : "justify-start";
  const buttonShape = str(props, "style") === "outline" ? BUTTON_OUTLINE_SHAPE : BUTTON_DARK_SHAPE;
  const t = textStyleAttrs(props, { align: "text-center", size: "text-sm" });
  // While editing the label in place, this renders as a plain <span>, not
  // a real <a>/<Link> -- clicking into the text to edit it must never
  // navigate away, href or not.
  const el = (
    <div className={`flex ${alignClass}`}>
      {editableText ? (
        <span className={`${buttonShape} ${t.className}`.trim()} style={t.style}>
          <InlineTextInput edit={editableText} placeholder="Button text" autoWidth />
        </span>
      ) : (
        <ButtonLink href={href} label={label} className={`${buttonShape} ${t.className}`.trim()} style={t.style} />
      )}
    </div>
  );
  if (nested) return <ElementBox props={props}>{el}</ElementBox>;
  return (
    <Section props={props} width="max-w-3xl">
      {el}
    </Section>
  );
}

export function IconBlock({ props, nested = false, editableText }: { props: Props; nested?: boolean; editableText?: InlineEdit }) {
  const Glyph = ICON_COMPONENTS[str(props, "icon")] ?? Star;
  const label = str(props, "label");
  const href = str(props, "href");
  const size = ICON_SIZE[str(props, "size")] ?? ICON_SIZE.md;
  // Resolved on the label itself (not a wrapping span) and used
  // identically whether editing or not -- a hardcoded class on only one
  // of those two render paths is how this drifted before: the static
  // label's own "text-sm font-medium" always won over an outer
  // wrapper's style override, while the input (no such class of its
  // own) correctly inherited it, so the two looked different.
  const t = textStyleAttrs(props, { align: "text-center", size: "text-sm", weight: "font-medium" });
  const inner = (
    <span className="inline-flex flex-col items-center gap-2">
      <Glyph className={size} strokeWidth={1.75} aria-hidden={label ? "true" : undefined} />
      {editableText ? (
        <InlineTextInput edit={editableText} placeholder="Label (optional)" className={t.className} style={t.style} autoWidth />
      ) : (
        label && (
          <span className={t.className} style={t.style}>
            {label}
          </span>
        )
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
  if (nested) return <ElementBox props={props}>{wrapped}</ElementBox>;
  return (
    <Section props={props} width="max-w-xs">
      {wrapped}
    </Section>
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
export function NestedElement({ block, editableText }: { block: PageBlock; editableText?: InlineEdit }) {
  const props = block.props as Props;
  switch (block.type) {
    case "richText":
      return <RichTextBlock props={props} nested />;
    case "heading":
      return <HeadingBlock props={props} nested editableText={editableText} />;
    case "image":
      return <ImageBlock props={props} nested editableText={editableText} />;
    case "video":
      return <VideoBlock props={props} nested editableText={editableText} />;
    case "button":
      return <ButtonBlock props={props} nested editableText={editableText} />;
    case "icon":
      return <IconBlock props={props} nested editableText={editableText} />;
    case "customCode":
      return <CustomCodeBlock props={props} nested />;
    case "countdown":
      return <CountdownBlock props={props} nested />;
    case "socialIcons":
      return <SocialIconsBlock props={props} nested />;
    case "spacer":
      return <SpacerBlock props={props} />;
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
    <Section props={props}>
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
    </Section>
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

export function ImageBlock({ props, nested = false, editableText }: { props: Props; nested?: boolean; editableText?: InlineEdit }) {
  const image = str(props, "image");
  if (!image) return null;
  const full = str(props, "size") === "full";
  const t = textStyleAttrs(props, { align: "text-center", size: "text-sm" });
  const figure = (
    <figure>
      <div className="relative aspect-[1200/650] w-full overflow-hidden rounded-2xl">
        <BlockImage src={image} alt={str(props, "alt")} sizes={nested ? "(min-width: 768px) 33vw, 100vw" : full ? "(min-width: 1152px) 1152px, 100vw" : "(min-width: 896px) 896px, 100vw"} className="object-cover" />
      </div>
      {(str(props, "caption") || editableText) && (
        <figcaption className={`mt-3 text-ink-soft ${t.className}`.trim()} style={t.style}>
          {editableText ? <InlineTextInput edit={editableText} placeholder="Caption" /> : str(props, "caption")}
        </figcaption>
      )}
    </figure>
  );
  if (nested) return <ElementBox props={props}>{figure}</ElementBox>;
  return (
    <Section props={props} width={full ? "max-w-6xl" : "max-w-4xl"}>
      {figure}
    </Section>
  );
}

function embedUrl(url: string): string | null {
  const youtube = extractYoutubeId(url);
  if (youtube) return `https://www.youtube-nocookie.com/embed/${youtube}`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return vimeo ? `https://player.vimeo.com/video/${vimeo[1]}` : null;
}

export function VideoBlock({ props, nested = false, editableText }: { props: Props; nested?: boolean; editableText?: InlineEdit }) {
  const src = embedUrl(str(props, "url"));
  if (!src) return null;
  const t = textStyleAttrs(props, { align: "text-center", size: "text-sm" });
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
        <figcaption className={`mt-3 text-ink-soft ${t.className}`.trim()} style={t.style}>
          {editableText ? <InlineTextInput edit={editableText} placeholder="Caption" /> : str(props, "caption")}
        </figcaption>
      )}
    </figure>
  );
  if (nested) return <ElementBox props={props}>{figure}</ElementBox>;
  return (
    <Section props={props} width="max-w-4xl">
      {figure}
    </Section>
  );
}

export function CustomCodeBlock({ props, nested = false }: { props: Props; nested?: boolean }) {
  const html = str(props, "html");
  if (!html) return null;
  const content = <div dangerouslySetInnerHTML={{ __html: html }} />;
  if (nested) return <ElementBox props={props}>{content}</ElementBox>;
  return <Section props={props}>{content}</Section>;
}

export function CountdownBlock({ props, nested = false }: { props: Props; nested?: boolean }) {
  const target = str(props, "target");
  if (!target) return null;
  const t = textStyleAttrs(props, { align: "text-center", size: "text-2xl sm:text-3xl", weight: "font-semibold" });
  const content = (
    <div className="flex flex-col items-center gap-6">
      {str(props, "heading") && (
        <h2 className={`font-display ${t.className}`.trim()} style={t.style}>
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
  if (nested) return <ElementBox props={props}>{content}</ElementBox>;
  return (
    <Section props={props} width="max-w-2xl">
      {content}
    </Section>
  );
}

export function CtaBlock({ props }: { props: Props }) {
  const buttons = (light: boolean) => (
    <div className="flex flex-col gap-3 sm:flex-row">
      <ButtonLink
        href={str(props, "buttonHref")}
        label={str(props, "buttonLabel")}
        className={light ? "rounded-full bg-paper px-6 py-3 text-center text-sm font-medium text-ink transition-opacity hover:opacity-80" : BUTTON_DARK}
      />
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
    <Section props={props} width="max-w-3xl">
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
    </Section>
  );
}

export function StatsBlock({ props }: { props: Props }) {
  const items = list(props, "items");
  return (
    <Section props={props}>
      <SectionHeading heading={str(props, "heading")} />
      <dl className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item, i) => (
          <div key={i} className="flex flex-col-reverse border-l border-line pl-6">
            <dt className="mt-2 text-sm text-ink-soft">{str(item, "label")}</dt>
            <dd className="font-display text-4xl font-semibold">{str(item, "value")}</dd>
          </div>
        ))}
      </dl>
    </Section>
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

export function LatestPostsView({ props, posts }: { props: Props; posts: BlogIndexEntry[] }) {
  const visible = posts.slice(0, num(props, "count", 3));
  if (!visible.length) return null;
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

export function LatestCoursesView({ props, courses }: { props: Props; courses: CourseSummary[] }) {
  const visible = courses.slice(0, num(props, "count", 3));
  if (!visible.length) return null;
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

export function ReviewsView({ props, reviewers }: { props: Props; reviewers: Reviewer[] }) {
  const latest = reviewers.slice(0, num(props, "count", 3));
  if (!latest.length) return null;
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

export function FeaturedOnBlock({ props }: { props: Props }) {
  const items = list(props, "items").map((item) => ({
    href: str(item, "href"),
    badge: str(item, "badge"),
    width: typeof item.width === "number" ? item.width : 200,
    height: typeof item.height === "number" ? item.height : 60,
    alt: str(item, "alt"),
  }));
  return <FeaturedOn heading={str(props, "heading")} listings={items} />;
}

export function NewsletterBlock({ props }: { props: Props }) {
  return (
    <Section props={props} width="max-w-2xl">
      <div className="text-center">
        {str(props, "heading") && <h2 className="font-display text-3xl font-semibold">{str(props, "heading")}</h2>}
        {str(props, "text") && <p className="mt-3 whitespace-pre-line text-ink-soft">{str(props, "text")}</p>}
      </div>
      <div className="mt-8">
        <NewsletterSignupForm source="page-builder" dark={str(props, "background") === "dark"} />
      </div>
    </Section>
  );
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
  if (nested) return <ElementBox props={props}>{content}</ElementBox>;
  return (
    <Section props={props} width="max-w-3xl">
      {content}
    </Section>
  );
}

export function ContactFormSection({ props, business }: { props: Props; business: ResolvedBusiness }) {
  const details = bool(props, "showDetails") ? (
    <aside className="h-fit rounded-2xl border border-line bg-paper-soft p-6 lg:mt-2">
      {str(props, "detailsHeading") && <h2 className="font-display text-xl font-semibold">{str(props, "detailsHeading")}</h2>}
      <div className="mt-6">
        <BusinessContactDetails business={business} />
      </div>
    </aside>
  ) : null;
  return (
    <Section props={props} width="max-w-5xl">
      <ContactFormBlock
        heading={str(props, "heading")}
        text={str(props, "text")}
        messageLabel={str(props, "messageLabel") || "Message"}
        successHeading={str(props, "successHeading") || "Thanks, got it."}
        successText={str(props, "successText")}
        aside={details}
      />
    </Section>
  );
}

/** Replaces the deprecated "contactForm"/"newsletter" blocks with one
 * configurable section. Submits through the exact same backend pipelines
 * those two used (completeContactVerification / completeNewsletterVerification
 * in src/lib/otpCompletion.ts) -- only the block's own fields/labels are
 * generalized, not the OTP/webhook/email plumbing behind them. */
export function FormBlock({ props, business }: { props: Props; business: ResolvedBusiness }) {
  if (str(props, "mode") === "newsletter") {
    return (
      <Section props={props} width="max-w-2xl">
        <div className="text-center">
          {str(props, "heading") && <h2 className="font-display text-3xl font-semibold">{str(props, "heading")}</h2>}
          {str(props, "text") && <p className="mt-3 whitespace-pre-line text-ink-soft">{str(props, "text")}</p>}
        </div>
        <div className="mt-8">
          <NewsletterSignupForm source="page-builder" dark={str(props, "background") === "dark"} />
        </div>
      </Section>
    );
  }
  const details = bool(props, "showContactDetails") ? (
    <aside className="h-fit rounded-2xl border border-line bg-paper-soft p-6 lg:mt-2">
      {str(props, "detailsHeading") && <h2 className="font-display text-xl font-semibold">{str(props, "detailsHeading")}</h2>}
      <div className="mt-6">
        <BusinessContactDetails business={business} />
      </div>
    </aside>
  ) : null;
  return (
    <Section props={props} width="max-w-5xl">
      <ContactFormBlock
        heading={str(props, "heading")}
        text={str(props, "text")}
        messageLabel={str(props, "messageLabel") || "Message"}
        successHeading={str(props, "successHeading") || "Thanks, got it."}
        successText={str(props, "successText")}
        aside={details}
      />
    </Section>
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
