import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import type { Metadata } from "next";
import { getBlogCategories } from "@/lib/blogCategories";
import { getPublicPosts } from "@/lib/blogPosts";
import { buildSafe } from "@/lib/db";
import { serializeJsonLd } from "@/lib/jsonLd";
import { SITE_NAME } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";

export const metadata: Metadata = {
  title: "Blog Categories",
  description: "Browse every topic we write about \u2014 automation, AI tools, CRMs, and more.",
  alternates: { canonical: "/blog/category" },
};

export default async function BlogCategoryIndex() {
  // See the build-phase note on buildSafe (src/lib/db.ts): a fresh
  // self-host install's database may not be migrated yet when this page
  // is statically generated during `next build`.
  const [postsIndex, categories] = await buildSafe(
    () => Promise.all([getPublicPosts(), getBlogCategories()]),
    [[], []]
  );
  const countBySlug = new Map<string, number>();
  for (const p of postsIndex) {
    countBySlug.set(p.category, (countBySlug.get(p.category) || 0) + 1);
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${SITE_NAME} Blog Categories`,
    description: metadata.description,
    url: `${SITE_URL}/blog/category`,
    mainEntity: { "@type": "ItemList", itemListElement: categories.map((category, index) => ({ "@type": "ListItem", position: index + 1, name: category.name, url: `${SITE_URL}/blog/category/` + category.slug })) },
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <p className="text-sm text-ink-soft">
        <Link href="/blog" className="hover:text-ink">
          Blog
        </Link>{" "}
        / Categories
      </p>
      <h1 className="mt-2 font-display text-4xl font-semibold">Categories</h1>
      <p className="mt-3 max-w-2xl text-ink-soft">Browse every topic we write about.</p>

      <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <Link
            key={c.slug}
            href={`/blog/category/${c.slug}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-line"
          >
            <div className="relative aspect-[1200/650] w-full overflow-hidden rounded-xl border border-ink/15 bg-paper-soft">
              {c.image && <SafeImage
                src={c.image}
                alt={c.image_alt || c.name}
                fill
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                className="object-contain transition-transform duration-300 group-hover:scale-105"
              />}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-6">
              <h2 className="font-display text-lg font-semibold leading-snug">{c.name}</h2>
              <p className="line-clamp-2 text-sm text-ink-soft">{c.description}</p>
              <p className="mt-auto pt-2 text-xs font-medium uppercase tracking-wide text-ink-soft">
                {countBySlug.get(c.slug) || 0} posts
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
