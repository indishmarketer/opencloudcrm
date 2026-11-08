import Link from "next/link";
import Pagination from "@/components/Pagination";
import SafeImage from "@/components/SafeImage";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPosts } from "@/lib/blogPosts";
import { getBlogCategories } from "@/lib/blogCategories";
import { resolveImage } from "@/lib/images";
import { serializeJsonLd } from "@/lib/jsonLd";
import { SITE_NAME, OG_LOCALE } from "@/config/brand";
import { SITE_URL as BASE_URL } from "@/lib/liveSiteUrl";

export const dynamic = "force-dynamic";
export const dynamicParams = true;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const category = (await getBlogCategories()).find((c) => c.slug === slug);
  if (!category) return {};

  const page = typeof sp?.page === "string" ? parseInt(sp.page, 10) : 1;
  const canonicalUrl = page > 1 ? `/blog/category/${category.slug}?page=${page}` : `/blog/category/${category.slug}`;

  return {
    title: page > 1 ? `${category.name} - Page ${page}` : category.name,
    description: category.description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      url: canonicalUrl,
      siteName: SITE_NAME,
      locale: OG_LOCALE,
      images: category.image ? [{ url: category.image, width: 1200, height: 650, alt: category.image_alt || category.name }] : [],
    },
  };
}

export default async function BlogCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const categories = await getBlogCategories();
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();

  const allPosts = (await getPublicPosts()).filter((p) => p.category === slug);
  const POSTS_PER_PAGE = 12;
  const currentPage = typeof sp?.page === "string" ? Math.max(1, parseInt(sp.page, 10) || 1) : 1;
  const totalPages = Math.ceil(allPosts.length / POSTS_PER_PAGE);
  const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
  const posts = allPosts.slice(startIndex, startIndex + POSTS_PER_PAGE);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: category.name,
    description: category.description,
    url: `${BASE_URL}/blog/category/${category.slug}`,
    ...(category.image ? { image: category.image } : {}),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: posts.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${BASE_URL}/blog/${p.slug}/`,
        name: p.title,
      })),
    },
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />

      <p className="text-sm text-ink-soft">
        <Link href="/blog" className="hover:text-ink">
          Blog
        </Link>{" "}
        / {category.name}
      </p>

      <div className="relative mt-6 aspect-[1200/650] w-full max-w-2xl overflow-hidden rounded-xl border border-ink/15 bg-paper-soft">
        {category.image && <SafeImage src={category.image} alt={category.image_alt || category.name} fill className="object-contain" priority />}
      </div>

      <h1 className="mt-8 font-display text-4xl font-semibold">{category.name}</h1>
      {category.description && <p className="mt-3 max-w-2xl text-ink-soft">{category.description}</p>}

      <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => {
          const img = resolveImage(post.feature_image);
          return (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-line"
            >
              {img && (
                <div className="relative aspect-[1200/650] w-full overflow-hidden rounded-xl border border-ink/15 bg-paper-soft">
                  <SafeImage
                    src={img}
                    alt={post.title}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-contain transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2 p-6">
                <h2 className="font-display text-lg font-semibold leading-snug">{post.title}</h2>
                <p className="line-clamp-2 text-sm text-ink-soft">{post.excerpt}</p>
              </div>
            </Link>
          );
        })}
        {posts.length === 0 && <p className="text-sm text-ink-soft">No posts in this category yet.</p>}
      </div>

      <Pagination currentPage={currentPage} totalPages={totalPages} basePath={`/blog/category/${category.slug}`} />

      {categories.filter((c) => c.slug !== category.slug).length > 0 && (
        <div className="mt-16 border-t border-line pt-10">
          <p className="text-sm font-semibold text-ink-soft">Browse other categories</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {categories
              .filter((c) => c.slug !== category.slug)
              .map((c) => (
                <Link
                  key={c.slug}
                  href={`/blog/category/${c.slug}`}
                  className="rounded-full border border-line px-4 py-1.5 text-sm text-ink-soft transition-colors hover:border-ink hover:text-ink"
                >
                  {c.name}
                </Link>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
