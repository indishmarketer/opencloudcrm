import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedPage } from "@/lib/sitePages";
import SitePageView, { sitePageMetadata } from "@/components/pageBlocks/SitePageView";

// The homepage is a page-builder page (Console -> Pages -> Home). Saving
// there revalidates it immediately; the timer is only a safety net for a
// build that ran while the database was unreachable.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublishedPage("/");
  return page ? sitePageMetadata(page, "/") : {};
}

export default async function Home() {
  const page = await getPublishedPage("/");
  if (!page) notFound();
  return <SitePageView page={page} />;
}
