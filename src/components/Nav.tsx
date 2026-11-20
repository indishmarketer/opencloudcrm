import { pool, buildSafe } from "@/lib/db";
import NavClient from "@/components/NavClient";
import { getPublicPosts } from "@/lib/blogPosts";
import { getBlogCategories } from "@/lib/blogCategories";
import { getPublicSiteChrome } from "@/lib/siteChrome";
import { getSiteIdentity, resolveSiteName } from "@/lib/siteIdentity";
import { getPublishedPage } from "@/lib/sitePages";
import { isRetiredPublicPath } from "@/lib/retiredFeatures";
import type { HeaderItem } from "@/lib/siteChromeShape";

function activeHeaderItems(items: HeaderItem[]): HeaderItem[] {
  const active: HeaderItem[] = [];
  for (const item of items) {
    if (item.type === "link") {
      if (!isRetiredPublicPath(item.href)) active.push(item);
      continue;
    }
    if (item.type !== "dropdown") {
      active.push(item);
      continue;
    }
    const columns = item.columns
      .map((column) => ({ ...column, links: column.links.filter((link) => !isRetiredPublicPath(link.href)) }))
      .filter((column) => column.links.length > 0);
    if (columns.length) active.push({ ...item, columns });
  }
  return active;
}

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
  const coursesPage = await getPublishedPage("/courses");
  const showCourses = Boolean(coursesPage);
  const [courses, categories, chrome, identity] = await Promise.all([
    showCourses
      ? buildSafe(async () => (await pool.query("SELECT slug, title FROM courses WHERE published = true ORDER BY created_at DESC LIMIT 3")).rows, [])
      : Promise.resolve([]),
    buildSafe(() => latestBlogCategories(), []),
    getPublicSiteChrome(),
    getSiteIdentity(),
  ]);

  return (
    <NavClient
      courses={courses}
      categories={categories}
      items={activeHeaderItems(chrome.header.items)}
      ctaLabel={chrome.header.ctaLabel}
      ctaHref={chrome.header.ctaHref}
      siteName={resolveSiteName(identity)}
      logoUrl={identity.logoUrl}
      showCourses={showCourses}
    />
  );
}
