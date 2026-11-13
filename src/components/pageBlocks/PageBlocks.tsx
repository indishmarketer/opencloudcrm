import { Fragment } from "react";
import { SITE_NAME } from "@/config/brand";
import { getBusiness, type ResolvedBusiness } from "@/lib/businessProfile";
import { getSiteIdentity, resolveSiteName } from "@/lib/siteIdentity";
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

function renderBlock(block: PageBlock, props: Props, business: ResolvedBusiness, builtIn: React.ReactNode) {
  switch (block.type) {
    case "hero": return <HeroBlock props={props} />;
    case "pageHeader": return <PageHeaderBlock props={props} />;
    case "richText": return <RichTextBlock props={props} />;
    case "cards": return <CardsBlock props={props} />;
    case "split": return <SplitBlock props={props} />;
    case "image": return <ImageBlock props={props} />;
    case "video": return <VideoBlock props={props} />;
    case "cta": return <CtaBlock props={props} />;
    case "heading": return <HeadingBlock props={props} />;
    case "button": return <ButtonBlock props={props} />;
    case "icon": return <IconBlock props={props} />;
    case "row": return <RowBlock props={props} />;
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
    case "form": return <FormBlock props={props} />;
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
  const business = await getBusiness();
  const identity = await getSiteIdentity();
  const vars = mergeVars(business, resolveSiteName(identity));
  const htmlVars = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, escapeHtml(v)]));
  return (
    <>
      {blocks.map((block) => {
        const def = getBlockDef(block.type);
        if (!def) return null;
        const props = resolveBlockProps(block, vars, htmlVars);
        return <Fragment key={block.id}>{renderBlock(block, props, business, builtIn)}</Fragment>;
      })}
    </>
  );
}
