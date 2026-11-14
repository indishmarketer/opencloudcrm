import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ToolsDirectoryContent from "@/components/ToolsDirectoryContent";
import { builtInPageMetadata } from "@/components/pageBlocks/SitePageView";
import { getPublishedPage } from "@/lib/sitePages";

const baseMetadata: Metadata = {
  title: "Tools & Software Directory",
  description:
    "A directory of AI tools, automation, CRMs, open source tools, and software for marketers, coaches, and consultants, sorted by category and pricing.",
  alternates: { canonical: "/tools" },
};

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  if (!(await getPublishedPage("/tools"))) return {};
  return builtInPageMetadata("/tools", baseMetadata);
}

export default async function ToolsDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ pricing?: string; category?: string }>;
}) {
  const page = await getPublishedPage("/tools");
  if (!page) notFound();
  const { pricing, category } = await searchParams;
  return <ToolsDirectoryContent blocks={page.blocks} pricing={pricing} category={category} />;
}
