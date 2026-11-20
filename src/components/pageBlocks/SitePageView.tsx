import type { Metadata } from "next";
import { getBusiness } from "@/lib/businessProfile";
import { getSiteIdentity, resolveSiteName } from "@/lib/siteIdentity";
import { applyMergeTags } from "@/lib/pageBlocks";
import type { PageSnapshot } from "@/lib/sitePagesShape";
import { getPublishedPage } from "@/lib/sitePages";
import PageBlocks, { mergeVars } from "@/components/pageBlocks/PageBlocks";
import { ogImagesFrom } from "@/lib/ogImage";

/** Title/description/OG/robots for a page-builder page. The meta title
 * falls back to the page title; placeholders like {{site_name}} work here
 * too. `fallback` is a built-in route's own code metadata, used for any
 * field the page doesn't set. */
export async function sitePageMetadata(page: PageSnapshot, path: string, fallback: Metadata = {}): Promise<Metadata> {
  const [business, identity] = await Promise.all([getBusiness(), getSiteIdentity()]);
  // Next.js replaces openGraph rather than merging it, so declaring one
  // here without images silently threw away the layout's default and left
  // these pages with no og:image at all. Order of preference: the page's
  // own image, whatever the calling route already decided, then the site
  // default. identity is already in hand, so this costs no extra query.
  const fallbackOpenGraph = fallback.openGraph;
  const fallbackImages =
    fallbackOpenGraph && "images" in fallbackOpenGraph ? fallbackOpenGraph.images : undefined;
  const images = page.ogImage
    ? [{ url: page.ogImage }]
    : fallbackImages || ogImagesFrom(identity.ogImageUrl);
  const siteName = resolveSiteName(identity);
  const vars = mergeVars(business, siteName);
  const title = applyMergeTags(page.metaTitle || page.title, vars);
  const description = applyMergeTags(page.metaDescription, vars);
  const isHome = path === "/";
  return {
    ...fallback,
    ...(title && !isHome ? { title } : {}),
    ...(title && isHome ? { title: { absolute: title === "Home" ? siteName : title } } : {}),
    ...(description ? { description } : {}),
    alternates: { canonical: path },
    openGraph: {
      ...(fallback.openGraph || {}),
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      url: path,
      images,
    },
    ...(page.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

export default function SitePageView({ page, builtIn }: { page: PageSnapshot; builtIn?: React.ReactNode }) {
  return <PageBlocks blocks={page.blocks} builtIn={builtIn} />;
}

/** For built-in routes (/courses, /terms...): metadata from the page
 * record when someone has edited it, else the route's own code metadata. */
export async function builtInPageMetadata(path: string, fallback: Metadata): Promise<Metadata> {
  const page = await getPublishedPage(path);
  if (!page || page.id === null) return fallback;
  return sitePageMetadata(page, path, fallback);
}

/** Renders a built-in route through its editable sections; `children` is
 * the route's own content, shown where the "Page's own content" section is. */
export async function BuiltInPage({ path, children }: { path: string; children: React.ReactNode }) {
  const page = await getPublishedPage(path);
  if (!page) return <>{children}</>;
  return <PageBlocks blocks={page.blocks} builtIn={children} />;
}
