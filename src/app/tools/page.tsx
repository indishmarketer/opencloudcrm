import type { Metadata } from "next";
import Link from "next/link";
import { serializeJsonLd } from "@/lib/jsonLd";
import { listCategoriesWithCounts, listPublishedTools } from "@/lib/directory";
import { heroLogoWindow } from "@/lib/directoryHero";
import { getDirectoryListingPrice, formatListingPrice } from "@/lib/directoryListingPrice";
import DirectoryBrowser from "@/components/DirectoryBrowser";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { BuiltInPage, builtInPageMetadata } from "@/components/pageBlocks/SitePageView";

const baseMetadata: Metadata = {
  title: "Tools & Software Directory",
  description:
    "A directory of AI tools, automation, CRMs, open source tools, and software for marketers, coaches, and consultants, sorted by category and pricing.",
  alternates: { canonical: "/tools" },
};

export const revalidate = 300;


export async function generateMetadata(): Promise<Metadata> {
  return builtInPageMetadata("/tools", baseMetadata);
}

export default async function ToolsDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ pricing?: string; category?: string }>;
}) {
  const { pricing, category } = await searchParams;
  const [categories, tools, listingPrice] = await Promise.all([
    listCategoriesWithCounts(),
    listPublishedTools(),
    getDirectoryListingPrice(),
  ]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Tools & Software Directory",
    url: `${SITE_URL}/tools`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: tools.map((t, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}/tools/${t.category_slug}/${t.slug}`,
        name: t.name,
      })),
    },
  };

  // Only what the cards and filters actually read.
  //
  // `listPublishedTools` returns the full row, and handing that straight to
  // a client component serialised every tool's description (up to 6000
  // characters), screenshots, website URL and timestamps into the page --
  // twice, once in the HTML and again in the RSC payload -- for fields no
  // card renders and no filter searches. On 90 tools that was most of the
  // page weight. Narrowing it here keeps `listPublishedTools` usable by the
  // detail pages, which do need the whole row.
  const cardTools = tools.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    tagline: t.tagline,
    logo_url: t.logo_url,
    pricing_type: t.pricing_type,
    category_slug: t.category_slug,
    category_name: t.category_name,
    subcategory: t.subcategory,
    featured: t.featured,
  }));
  const browserCategories = categories.map((c) => ({
    slug: c.slug,
    name: c.name,
    tool_count: c.tool_count,
  }));

  const liveCategories = categories.filter((c) => c.tool_count > 0);

  return (
    <BuiltInPage path="/tools">
    <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />

      {tools.length === 0 ? (
        <div className="py-20 text-center">
          <h1 className="font-display text-4xl font-semibold">Tools &amp; software directory</h1>
          <p className="mt-3 text-sm text-ink-soft">
            The directory is being built right now. Check back soon.
          </p>
        </div>
      ) : (
        <DirectoryBrowser
          tools={cardTools}
          categories={browserCategories}
          heroLogos={heroLogoWindow(tools)}
          priceLabel={formatListingPrice(listingPrice.usd, "USD")}
          initialPricing={pricing}
          initialCategory={category}
        />
      )}

      {/* The category grid that used to sit above the results is gone: the
          picker in the browser above covers choosing one, and the grid
          pushed every tool below the fold. These stay as crawlable links to
          the indexed category pages, which a client-side filter is not. */}
      {liveCategories.length > 0 && (
        <section className="mt-16 border-t border-line pt-10">
          <h2 className="font-display text-lg font-semibold">Categories</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {liveCategories.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/tools/${c.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-sm text-ink-soft transition-colors hover:border-ink hover:text-ink"
                >
                  {c.name}
                  <span className="text-xs text-ink-soft/70">{c.tool_count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
    </BuiltInPage>
  );
}
