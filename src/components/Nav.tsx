import { pool, buildSafe } from "@/lib/db";
import NavClient from "@/components/NavClient";
import { getPublicPosts } from "@/lib/blogPosts";
import { getBlogCategories } from "@/lib/blogCategories";
import { getPublicSiteChrome } from "@/lib/siteChrome";
import { getSiteIdentity, resolveSiteName } from "@/lib/siteIdentity";
import { getPageGroupToggles } from "@/lib/pageGroupToggles";

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

// Nav renders on every page via the root layout, so any unguarded query
// here fails every single page's build, not just one route -- see the
// buildSafe note in src/lib/db.ts.
export default async function Nav() {
  const toggles = await getPageGroupToggles();
  const [courses, webinars, categories, chrome, identity] = await Promise.all([
    toggles.courses
      ? buildSafe(async () => (await pool.query("SELECT slug, title FROM courses WHERE published = true ORDER BY created_at DESC LIMIT 3")).rows, [])
      : Promise.resolve([]),
    toggles.webinars
      ? buildSafe(async () => (await pool.query("SELECT slug, title FROM webinars WHERE status = 'published' ORDER BY created_at DESC LIMIT 3")).rows, [])
      : Promise.resolve([]),
    buildSafe(() => latestBlogCategories(), []),
    getPublicSiteChrome(),
    getSiteIdentity(),
  ]);

  return (
    <NavClient
      courses={courses}
      webinars={webinars}
      categories={categories}
      items={chrome.header.items}
      ctaLabel={chrome.header.ctaLabel}
      ctaHref={chrome.header.ctaHref}
      siteName={resolveSiteName(identity)}
      logoUrl={identity.logoUrl}
      showCourses={toggles.courses}
      showWebinars={toggles.webinars}
    />
  );
}
