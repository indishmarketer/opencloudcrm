import { pool } from "@/lib/db";
import NavClient from "@/components/NavClient";
import { getPublicPosts } from "@/lib/blogPosts";
import { getBlogCategories } from "@/lib/blogCategories";
import { getSiteChrome } from "@/lib/siteChrome";
import { getSiteIdentity, resolveSiteName } from "@/lib/siteIdentity";

/** The 3 categories behind the most recently published posts, in that
 * order (postsIndex is already newest-first) -- not the 3 newest post
 * titles themselves, which run long and wrap badly in the nav column. */
async function latestBlogCategories() {
  const postsIndex = await getPublicPosts();
  const nameBySlug = new Map((await getBlogCategories()).map((c) => [c.slug, c.name]));
  const seen = new Set<string>();
  const result: { slug: string; title: string }[] = [];
  for (const post of postsIndex) {
    if (seen.has(post.category) || !nameBySlug.has(post.category)) continue;
    seen.add(post.category);
    result.push({ slug: post.category, title: nameBySlug.get(post.category)! });
    if (result.length >= 3) break;
  }
  return result;
}

export default async function Nav() {
  const [coursesResult, webinarsResult, categories, chrome, identity] = await Promise.all([
    pool.query("SELECT slug, title FROM courses WHERE published = true ORDER BY created_at DESC LIMIT 3"),
    pool.query("SELECT slug, title FROM webinars WHERE status = 'published' ORDER BY created_at DESC LIMIT 3"),
    latestBlogCategories(),
    getSiteChrome(),
    getSiteIdentity(),
  ]);

  return (
    <NavClient
      courses={coursesResult.rows}
      webinars={webinarsResult.rows}
      categories={categories}
      items={chrome.header.items}
      ctaLabel={chrome.header.ctaLabel}
      ctaHref={chrome.header.ctaHref}
      siteName={resolveSiteName(identity)}
      logoUrl={identity.logoUrl}
    />
  );
}
