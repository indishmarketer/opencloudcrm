import type { Metadata } from "next";
import { getPublishedPage } from "@/lib/sitePages";
import SitePageView, { sitePageMetadata } from "@/components/pageBlocks/SitePageView";
import NotLiveYet from "@/components/NotLiveYet";

// The homepage is a page-builder page (Console -> Pages -> Home). Saving
// there revalidates it immediately; the timer is only a safety net for a
// build that ran while the database was unreachable.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublishedPage("/");
  return page ? sitePageMetadata(page, "/") : { robots: { index: false, follow: false } };
}

export default async function Home() {
  const page = await getPublishedPage("/");
  // getPublishedPage("/") only returns null when the homepage row exists
  // but was never published -- i.e. a fresh install nobody has set up yet
  // (it falls back to the built-in starter design instead of null on a
  // genuine DB outage, and the homepage can't be unpublished once it's been
  // published once -- see sitePages.ts). Never a transient/error state, so
  // showing a dedicated landing here instead of a plain 404 is safe.
  if (!page) return <NotLiveYet />;
  return <SitePageView page={page} />;
}
