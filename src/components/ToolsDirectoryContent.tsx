import Link from "next/link";
import { serializeJsonLd } from "@/lib/jsonLd";
import { listCategoriesWithCounts, listPublishedTools } from "@/lib/directory";
import { heroLogoWindow } from "@/lib/directoryHero";
import { getDirectoryListingPrice, formatListingPrice } from "@/lib/directoryListingPrice";
import { directoryHeroFromBlocks } from "@/lib/directoryPageHero";
import type { PageBlock } from "@/lib/pageBlocks";
import { SITE_URL } from "@/lib/liveSiteUrl";
import DirectoryBrowser from "@/components/DirectoryBrowser";

export default async function ToolsDirectoryContent({ blocks, pricing, category }: {
  blocks: PageBlock[];
  pricing?: string;
  category?: string;
}) {
  const [categories, tools, listingPrice] = await Promise.all([
    listCategoriesWithCounts(), listPublishedTools(), getDirectoryListingPrice(),
  ]);
  const hero = directoryHeroFromBlocks(blocks);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: hero.eyebrow,
    url: `${SITE_URL}/tools`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: tools.map((tool, index) => ({
        "@type": "ListItem", position: index + 1,
        url: `${SITE_URL}/tools/${tool.category_slug}/${tool.slug}`, name: tool.name,
      })),
    },
  };
  const cardTools = tools.map((tool) => ({
    id: tool.id, slug: tool.slug, name: tool.name, tagline: tool.tagline,
    logo_url: tool.logo_url, pricing_type: tool.pricing_type,
    category_slug: tool.category_slug, category_name: tool.category_name,
    subcategory: tool.subcategory, featured: tool.featured,
  }));
  const browserCategories = categories.map((item) => ({
    slug: item.slug, name: item.name, tool_count: item.tool_count,
  }));
  const liveCategories = categories.filter((item) => item.tool_count > 0);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <DirectoryBrowser
        tools={cardTools} categories={browserCategories} heroLogos={heroLogoWindow(tools)}
        priceLabel={formatListingPrice(listingPrice.usd, "USD")}
        initialPricing={pricing} initialCategory={category} hero={hero}
      />
      {liveCategories.length > 0 && (
        <section className="mt-16 border-t border-line pt-10">
          <h2 className="font-display text-lg font-semibold">{hero.categoriesHeading}</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {liveCategories.map((item) => (
              <li key={item.id}>
                <Link href={`/tools/${item.slug}`} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-sm text-ink-soft transition-colors hover:border-ink hover:text-ink">
                  {item.name}<span className="text-xs text-ink-soft/70">{item.tool_count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
