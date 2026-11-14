import { serializeJsonLd } from "@/lib/jsonLd";
import { listCategoriesWithCounts, listPublishedTools } from "@/lib/directory";
import { heroLogoWindow } from "@/lib/directoryHero";
import { getDirectoryListingPrice, formatListingPrice } from "@/lib/directoryListingPrice";
import type { PageBlock } from "@/lib/pageBlocks";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { DirectoryProvider } from "@/components/DirectoryBlocks";
import PageBlocks from "@/components/pageBlocks/PageBlocks";

export default async function ToolsDirectoryContent({ blocks, pricing, category }: {
  blocks: PageBlock[];
  pricing?: string;
  category?: string;
}) {
  const [categories, tools, listingPrice] = await Promise.all([
    listCategoriesWithCounts(), listPublishedTools(), getDirectoryListingPrice(),
  ]);
  const jsonLd = {
    "@context": "https://schema.org", "@type": "CollectionPage",
    name: "Tools & Software Directory", url: `${SITE_URL}/tools`,
    mainEntity: { "@type": "ItemList", itemListElement: tools.map((tool, index) => ({
      "@type": "ListItem", position: index + 1,
      url: `${SITE_URL}/tools/${tool.category_slug}/${tool.slug}`, name: tool.name,
    })) },
  };
  const data = {
    tools: tools.map((tool) => ({
      id: tool.id, slug: tool.slug, name: tool.name, tagline: tool.tagline,
      logo_url: tool.logo_url, pricing_type: tool.pricing_type,
      category_slug: tool.category_slug, category_name: tool.category_name,
      subcategory: tool.subcategory, featured: tool.featured,
    })),
    categories: categories.map((item) => ({ slug: item.slug, name: item.name, tool_count: item.tool_count })),
    heroLogos: heroLogoWindow(tools),
    priceLabel: formatListingPrice(listingPrice.usd, "USD"),
  };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <DirectoryProvider data={data} initialPricing={pricing} initialCategory={category}>
      <PageBlocks blocks={blocks} />
    </DirectoryProvider>
  </>;
}
