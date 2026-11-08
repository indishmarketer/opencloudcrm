import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import type { Metadata } from "next";
import { getPublicPosts } from "@/lib/blogPosts";
import { getBlogCategories } from "@/lib/blogCategories";
import { resolveImage } from "@/lib/images";
import CategorySelect from "@/components/CategorySelect";
import { serializeJsonLd } from "@/lib/jsonLd";
import { SITE_NAME } from "@/config/brand";
import { SITE_URL as BASE_URL } from "@/lib/liveSiteUrl";
import { BuiltInPage, builtInPageMetadata } from "@/components/pageBlocks/SitePageView";

import Pagination from "@/components/Pagination";

const POSTS_PER_PAGE = 12;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const page = typeof params?.page === "string" ? parseInt(params.page, 10) : 1;
  const canonicalUrl = page > 1 ? `/blog?page=${page}` : "/blog";

  const meta = await builtInPageMetadata("/blog", {
    title: "Blog",
    description: `Guides and articles from ${SITE_NAME}.`,
  });
  return {
    ...meta,
    ...(page > 1 ? { title: `Blog - Page ${page}` } : {}),
    alternates: { canonical: canonicalUrl },
  };
}

export default async function BlogIndex({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const currentPage = typeof params?.page === "string" ? Math.max(1, parseInt(params.page, 10) || 1) : 1;
  const [postsIndex, categories] = await Promise.all([getPublicPosts(), getBlogCategories()]);
  const categoryMap = new Map(categories.map((c) => [c.slug, c.name]));

  const totalPages = Math.ceil(postsIndex.length / POSTS_PER_PAGE);
  const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
  const paginatedPosts = postsIndex.slice(startIndex, startIndex + POSTS_PER_PAGE);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: `${SITE_NAME} Blog`,
    description: `Guides and articles from ${SITE_NAME}.`,
    url: BASE_URL + "/blog",
    publisher: { "@type": "Organization", name: SITE_NAME, url: BASE_URL },
    blogPost: paginatedPosts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: BASE_URL + "/blog/" + post.slug,
      datePublished: post.published_at,
    })),
  };

  return (
    <BuiltInPage path="/blog">
    <div className="mx-auto max-w-6xl px-6 pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />

      <div className="flex flex-wrap items-center gap-3">
        <CategorySelect options={categories} allLabel="All categories" allHref="/blog" basePath="/blog/category" />
        <Link href="/blog/category" className="text-sm text-ink-soft transition-colors hover:text-ink">
          Browse all categories
        </Link>
      </div>

      <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {paginatedPosts.map((post) => {
          const img = resolveImage(post.feature_image);
          const categoryName = categoryMap.get(post.category);
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
                {categoryName && (
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                    {categoryName}
                  </span>
                )}
                <h2 className="font-display text-lg font-semibold leading-snug">
                  {post.title}
                </h2>
                <p className="line-clamp-2 text-sm text-ink-soft">{post.excerpt}</p>
              </div>
            </Link>
          );
        })}
      </div>

      <Pagination currentPage={currentPage} totalPages={totalPages} basePath="/blog" />

      <div className="mt-16 flex flex-col items-start gap-2 rounded-2xl border border-line p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-lg font-semibold">Want to write for us?</p>
          <p className="mt-1 text-sm text-ink-soft">We&apos;re always open to guest contributors.</p>
        </div>
        <Link
          href="/apply-to-write"
          className="shrink-0 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80"
        >
          Apply to write
        </Link>
      </div>
    </div>
    </BuiltInPage>
  );
}
