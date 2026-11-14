import { Fragment } from "react";
import { SITE_NAME } from "@/config/brand";
import { getBusiness, type ResolvedBusiness } from "@/lib/businessProfile";
import { getSiteIdentity, resolveSiteName } from "@/lib/siteIdentity";
import { getPublicFormViews, type PublicFormView } from "@/lib/forms";
import { getPopupsByIds, type Popup } from "@/lib/popups";
import { mobileOverrideCss, mobileClassFor } from "@/lib/mobileOverrides";
import { applyMergeTags, blockFields, getBlockDef, type FieldDef, type PageBlock } from "@/lib/pageBlocks";
import { escapeHtml } from "@/lib/escapeHtml";
import CustomBlock from "@/components/pageBlocks/CustomBlock";
import {
  AlertBlock,
  AudioBlock,
  BlockquoteBlock,
  BreadcrumbsBlock,
  BusinessDetailsBlock,
  ButtonBlock,
  CardsBlock,
  ContactDetailsBlock,
  CountdownBlock,
  CtaBlock,
  CustomCodeBlock,
  DividerBlock,
  EmbedBlock,
  FaqBlock,
  FeaturedOnBlock,
  FormBlock,
  HeadingBlock,
  NestedElement as PopupElement,
  HeroBlock,
  IconBlock,
  ImageBlock,
  IntegrationsBlock,
  LatestCoursesBlock,
  LatestPostsBlock,
  ListBlock,
  LogoBlock,
  MapBlock,
  PageHeaderBlock,
  PriceTableBlock,
  ProgressBlock,
  RatingBlock,
  ReviewsBlock,
  RichTextBlock,
  RowBlock,
  SocialIconsBlock,
  SpacerBlock,
  SplitBlock,
  StatsBlock,
  StepsBlock,
  TableBlock,
  TabsBlock,
  TeamMemberBlock,
  TestimonialBlock,
  VideoBlock,
  WorkflowDemoBlock,
  type Props,
} from "@/components/pageBlocks/blocks";

export function mergeVars(business: ResolvedBusiness, siteName: string = SITE_NAME): Record<string, string> {
  return {
    site_name: siteName,
    business_name: business.brand,
    owner_name: business.ownerName,
    email: business.email,
    phone: business.phone,
    address: business.addressOneLine,
    hours: business.hours,
    year: String(new Date().getFullYear()),
  };
}

/** Fills {{placeholders}} in every text field. Rich text gets HTML-escaped
 * values, since it's injected as HTML. */
function resolveProps(fields: FieldDef[], props: Props, vars: Record<string, string>, htmlVars: Record<string, string>): Props {
  const out: Props = { ...props };
  for (const field of fields) {
    const value = props[field.key];
    if (field.kind === "list" && Array.isArray(value)) {
      out[field.key] = value.map((item) => resolveProps(field.fields, item as Props, vars, htmlVars));
    } else if (typeof value === "string") {
      out[field.key] = applyMergeTags(value, field.kind === "richtext" ? htmlVars : vars);
    }
  }
  return out;
}

/** blockFields() doesn't know about a row's `items` (nested PageBlocks, not
 * a plain FieldDef list), so merge tags inside a row's columns need their
 * own recursive pass on top of resolveProps. */
function resolveBlockProps(block: PageBlock, vars: Record<string, string>, htmlVars: Record<string, string>): Props {
  const def = getBlockDef(block.type);
  if (!def) return block.props;
  const out = resolveProps(blockFields(def), block.props, vars, htmlVars);
  if (block.type === "row" && Array.isArray(block.props.items)) {
    out.items = (block.props.items as PageBlock[][]).map((column) =>
      column.map((item) => ({ ...item, props: resolveBlockProps(item, vars, htmlVars) }))
    );
  }
  return out;
}

/** Every referenced popup, rendered once with the same element renderer the
 * page itself uses (so anything valid on a page is valid inside a popup),
 * keyed by id. Shared by a Button's "opens a popup" action and a rich-text
 * hyperlink set to "Open a popup" -- one resolved map, built once per page
 * render, rather than re-rendering a popup's blocks for every link that
 * opens it. */
function resolvePopups(popups: Record<number, Popup>): Record<number, { settings: Popup["settings"]; content: React.ReactNode }> {
  const out: Record<number, { settings: Popup["settings"]; content: React.ReactNode }> = {};
  for (const [idStr, found] of Object.entries(popups)) {
    out[Number(idStr)] = {
      settings: found.settings,
      // `out` is read lazily (React doesn't render this until the whole
      // map has been built), so a popup whose own text links to another
      // popup resolves correctly regardless of which one this loop
      // happened to build first.
      content: (
        <>
          {found.blocks.map((el) => (
            <PopupElement key={el.id} block={el} popups={out} />
          ))}
        </>
      ),
    };
  }
  return out;
}

function renderBlock(
  block: PageBlock,
  props: Props,
  business: ResolvedBusiness,
  builtIn: React.ReactNode,
  forms: Record<number, PublicFormView>,
  resolvedPopups: Record<number, { settings: Popup["settings"]; content: React.ReactNode }>,
) {
  const popupFor = (p: Props) => {
    if (p.action !== "popup") return undefined;
    return resolvedPopups[Number(p.popupId) || 0];
  };
  switch (block.type) {
    case "hero": return <HeroBlock props={props} />;
    case "pageHeader": return <PageHeaderBlock props={props} />;
    case "richText": return <RichTextBlock props={props} popups={resolvedPopups} />;
    case "cards": return <CardsBlock props={props} />;
    case "split": return <SplitBlock props={props} />;
    case "image": return <ImageBlock props={props} />;
    case "video": return <VideoBlock props={props} />;
    case "cta": return <CtaBlock props={props} />;
    case "heading": return <HeadingBlock props={props} />;
    case "button": return <ButtonBlock props={props} popup={popupFor(props)} />;
    case "icon": return <IconBlock props={props} />;
    case "row": return <RowBlock props={props} popups={resolvedPopups} />;
    case "custom": return <CustomBlock props={props} blockId={block.id} />;
    case "customCode": return <CustomCodeBlock props={props} />;
    case "countdown": return <CountdownBlock props={props} />;
    case "socialIcons": return <SocialIconsBlock props={props} />;
    case "faq": return <FaqBlock props={props} />;
    case "stats": return <StatsBlock props={props} />;
    case "latestPosts": return <LatestPostsBlock props={props} />;
    case "latestCourses": return <LatestCoursesBlock props={props} />;
    case "reviews": return <ReviewsBlock props={props} />;
    case "workflowDemo": return <WorkflowDemoBlock props={props} />;
    case "integrations": return <IntegrationsBlock props={props} />;
    case "featuredOn": return <FeaturedOnBlock props={props} />;
    case "form": return <FormBlock props={props} form={forms[Number(props.savedFormId) || 0]} />;
    case "contactDetails": return <ContactDetailsBlock props={props} business={business} />;
    case "businessDetails": return <BusinessDetailsBlock props={props} business={business} />;
    case "spacer": return <SpacerBlock props={props} />;
    case "divider": return <DividerBlock props={props} />;
    case "list": return <ListBlock props={props} />;
    case "testimonial": return <TestimonialBlock props={props} />;
    case "rating": return <RatingBlock props={props} />;
    case "alert": return <AlertBlock props={props} />;
    case "blockquote": return <BlockquoteBlock props={props} />;
    case "table": return <TableBlock props={props} />;
    case "progress": return <ProgressBlock props={props} />;
    case "priceTable": return <PriceTableBlock props={props} />;
    case "teamMember": return <TeamMemberBlock props={props} />;
    case "steps": return <StepsBlock props={props} />;
    case "tabs": return <TabsBlock props={props} />;
    case "map": return <MapBlock props={props} />;
    case "embed": return <EmbedBlock props={props} />;
    case "breadcrumbs": return <BreadcrumbsBlock props={props} />;
    case "audio": return <AudioBlock props={props} />;
    case "logo": return <LogoBlock props={props} />;
    case "builtIn": return builtIn ?? null;
    default: return null;
  }
}

/** Renders a page's sections in order. `builtIn` is the route's own
 * content (course list, policy text...) for the "builtIn" section. */
export default async function PageBlocks({ blocks, builtIn }: { blocks: PageBlock[]; builtIn?: React.ReactNode }) {
  // Every form this page embeds, resolved here in one query alongside the
  // rest of the page's data. The form component used to fetch its own
  // definition from the browser after hydration, so a page with a form
  // showed "Loading…" where the form belonged -- on the live page, on
  // /f/<slug> and in the editor -- while the server already had everything
  // needed to draw it.
  const formIds = collectFormIds(blocks);
  const popupIds = collectPopupIds(blocks);
  const [business, identity, forms, popups] = await Promise.all([
    getBusiness(),
    getSiteIdentity(),
    formIds.length ? getPublicFormViews(formIds).catch(() => ({})) : Promise.resolve({}),
    popupIds.length ? getPopupsByIds(popupIds).catch(() => ({})) : Promise.resolve({}),
  ]);
  const vars = mergeVars(business, resolveSiteName(identity));
  const htmlVars = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, escapeHtml(v)]));
  const resolvedPopups = resolvePopups(popups);
  // One <style> for the whole page, holding only the values someone changed
  // while in mobile preview. Empty -- and so absent -- on a page that has
  // none, which is most of them. An inline style cannot carry a media
  // query, which is why these are classes rather than more inline styles.
  const mobileCss = mobileOverrideCss(blocks);
  return (
    <>
      {mobileCss && <style dangerouslySetInnerHTML={{ __html: mobileCss }} />}
      {blocks.map((block) => {
        const def = getBlockDef(block.type);
        if (!def) return null;
        const resolved = resolveBlockProps(block, vars, htmlVars);
        const props = resolved.mobile ? { ...resolved, mobileClass: mobileClassFor(block.id) } : resolved;
        return <Fragment key={block.id}>{renderBlock(block, props, business, builtIn, forms, resolvedPopups)}</Fragment>;
      })}
    </>
  );
}

/** Every `data-popup-id="N"` a rich-text hyperlink carries. A plain regex
 * over the saved HTML, same spirit as collectFormIds/collectPopupIds
 * walking the block tree -- no HTML parser needed just to pull out one
 * attribute. */
function popupIdsInHtml(html: unknown): number[] {
  if (typeof html !== "string" || !html.includes("data-popup-id")) return [];
  const ids: number[] = [];
  for (const match of html.matchAll(/data-popup-id="(\d+)"/g)) {
    const id = Number(match[1]);
    if (id) ids.push(id);
  }
  return ids;
}

/** Popup ids opened by any button or rich-text hyperlink on the page,
 * columns included. */
function collectPopupIds(blocks: PageBlock[]): number[] {
  const ids: number[] = [];
  const walk = (list: PageBlock[]) => {
    for (const block of list) {
      const props = block.props as Props;
      if (block.type === "button" && props?.action === "popup") {
        const id = Number(props.popupId) || 0;
        if (id) ids.push(id);
      }
      if (block.type === "richText") {
        ids.push(...popupIdsInHtml(props?.html));
      }
      const items = (block.props as { items?: unknown })?.items;
      if (Array.isArray(items)) {
        for (const column of items) if (Array.isArray(column)) walk(column as PageBlock[]);
      }
    }
  };
  walk(blocks);
  return ids;
}

/** Form ids anywhere in the tree, including inside a Row's columns. */
function collectFormIds(blocks: PageBlock[]): number[] {
  const ids: number[] = [];
  const walk = (list: PageBlock[]) => {
    for (const block of list) {
      if (block.type === "form") {
        const id = Number((block.props as Props)?.savedFormId) || 0;
        if (id) ids.push(id);
      }
      const items = (block.props as { items?: unknown })?.items;
      if (Array.isArray(items)) {
        for (const column of items) if (Array.isArray(column)) walk(column as PageBlock[]);
      }
    }
  };
  walk(blocks);
  return ids;
}
