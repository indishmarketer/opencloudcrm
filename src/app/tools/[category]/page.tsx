import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { serializeJsonLd } from "@/lib/jsonLd";
import { SITE_NAME, OG_LOCALE } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { listCategories, listPublishedTools } from "@/lib/directory";
import DirectoryToolCard from "@/components/DirectoryToolCard";
import SubmitToolCta from "@/components/SubmitToolCta";

export const revalidate = 300;

async function getCategory(slug: string) {
  const categories = await listCategories();
  return categories.find((c) => c.slug === slug) || null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const category = await getCategory(slug);
  if (!category) return {};
  const tools = await listPublishedTools({ category: slug });
  const description =
    category.description || `Compare the best ${category.name.toLowerCase()} for marketers, coaches, and small businesses.`;
  const canonicalPath = `/tools/${slug}`;
  return {
    title: `${category.name}: Compare the Best Options`,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: { title: category.name, description, url: canonicalPath, siteName: SITE_NAME, locale: OG_LOCALE },
    // An empty category is a thin page. Keep it out of search until it has tools.
    ...(tools.length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function DirectoryCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ subcategory?: string }>;
}) {
  const { category: slug } = await params;
  const { subcategory: activeSubcategory } = await searchParams;
  const category = await getCategory(slug);
  if (!category) notFound();

  const allTools = await listPublishedTools({ category: slug });
  const subcategories = Array.from(new Set(allTools.map((t) => t.subcategory).filter(Boolean))) as string[];
  const tools = activeSubcategory ? allTools.filter((t) => t.subcategory === activeSubcategory) : allTools;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: category.name,
    ...(category.description ? { description: category.description } : {}),
    url: `${SITE_URL}/tools/${slug}`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: tools.map((t, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}/tools/${slug}/${t.slug}`,
        name: t.name,
      })),
    },
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <p className="text-sm text-ink-soft">
        <Link href="/tools" className="hover:text-ink">
          Tools Directory
        </Link>{" "}
        / {category.name}
      </p>
      <h1 className="mt-2 font-display text-4xl font-semibold">{category.name}</h1>
      {category.description && <p className="mt-3 max-w-2xl text-ink-soft">{category.description}</p>}
      <p className="mt-3 text-sm text-ink-soft">
        {allTools.length} {allTools.length === 1 ? "tool" : "tools"} listed.{" "}
        <Link href="/tools/submit" className="underline hover:text-ink">
          Submit your tool
        </Link>
      </p>

      {subcategories.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href={`/tools/${slug}`}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              !activeSubcategory ? "border-ink text-ink" : "border-line text-ink-soft hover:border-ink hover:text-ink"
            }`}
          >
            All
          </Link>
          {subcategories.map((s) => (
            <Link
              key={s}
              href={`/tools/${slug}?subcategory=${encodeURIComponent(s)}`}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                activeSubcategory === s ? "border-ink text-ink" : "border-line text-ink-soft hover:border-ink hover:text-ink"
              }`}
            >
              {s}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-10">
        {tools.length === 0 ? (
          <p className="text-sm text-ink-soft">No tools in this category yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((t) => (
              <DirectoryToolCard key={t.slug} tool={t} />
            ))}
          </div>
        )}
      </div>

      <SubmitToolCta variant="wide" className="mt-16" />
    </div>
  );
}
