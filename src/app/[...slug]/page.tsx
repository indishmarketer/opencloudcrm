import type { Metadata } from "next";
import { permanentRedirect, redirect } from "next/navigation";
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

/** Course sales pages were removed, and the catch-all answers anything
 * unknown by sending it to "/". Any of those URLs that were shared or
 * indexed would land on the home page, which tells the visitor nothing.
 * The content they wanted is the course itself, so send them there
 * permanently instead. */
function movedSalesPagePath(slug: string[]): string | null {
  return slug.length === 3 && slug[0] === "courses" && slug[2] === "sales"
    ? `/courses/${slug[1]}`
    : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const path = pathFrom((await params).slug);
  const page = path ? await getPublishedPage(path) : null;
  return page ? sitePageMetadata(page, path!) : {};
}

export default async function CustomPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const slug = (await params).slug;
  const moved = movedSalesPagePath(slug);
  if (moved) permanentRedirect(moved);
  const path = pathFrom(slug);
  const page = path ? await getPublishedPage(path) : null;
  if (!page) redirect("/");
  return <SitePageView page={page} />;
}
