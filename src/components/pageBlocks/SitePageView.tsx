import type { Metadata } from "next";
import { getBusiness } from "@/lib/businessProfile";
import { getSiteIdentity, resolveSiteName } from "@/lib/siteIdentity";
import { applyMergeTags } from "@/lib/pageBlocks";
import type { PageSnapshot } from "@/lib/sitePagesShape";
import { getPublishedPage } from "@/lib/sitePages";
import PageBlocks, { mergeVars } from "@/components/pageBlocks/PageBlocks";

/** Title/description/OG/robots for a page-builder page. The meta title
 * falls back to the page title; placeholders like {{site_name}} work here
 * too. `fallback` is a built-in route's own code metadata, used for any
 * field the page doesn't set. */
export async function sitePageMetadata(page: PageSnapshot, path: string, fallback: Metadata = {}): Promise<Metadata> {
  const [business, identity] = await Promise.all([getBusiness(), getSiteIdentity()]);
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
      ...(page.ogImage ? { images: [{ url: page.ogImage }] } : {}),
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
