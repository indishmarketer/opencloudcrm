import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPublishedPage } from "@/lib/sitePages";
import { BUILT_IN_PATHS } from "@/lib/defaultPages";
import { normalizePagePath } from "@/lib/sitePagesShape";
import SitePageView, { sitePageMetadata } from "@/components/pageBlocks/SitePageView";

/** Every custom page made in Console -> Pages (/about, /pricing,
 * /services/web-design...). Real app routes always win over this catch-all,
 * so it only ever sees addresses nothing else claimed. */
export const revalidate = 300;

function pathFrom(slug: string[]): string | null {
  const raw = `/${slug.map((s) => decodeURIComponent(s)).join("/")}`;
  const path = normalizePagePath(raw);
  // Only exact, already-canonical addresses: /About or /about/ variants 404
  // rather than rendering duplicate URLs of the same page.
  if (path !== raw || BUILT_IN_PATHS.has(path)) return null;
  return path;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const path = pathFrom((await params).slug);
  const page = path ? await getPublishedPage(path) : null;
  return page ? sitePageMetadata(page, path!) : {};
}

export default async function CustomPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const path = pathFrom((await params).slug);
  const page = path ? await getPublishedPage(path) : null;
  if (!page) redirect("/");
  return <SitePageView page={page} />;
}
