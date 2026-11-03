import { getPublicPosts } from "@/lib/blogPosts";
import { SITE_URL as BASE_URL } from "@/config/brand";

import { pool } from "./db";

// Public, indexable pages only. Keep in sync with anything that isn't
// behind auth and doesn't carry a noindex tag (see src/app/console/layout.tsx
// for the one page that's deliberately excluded).
export async function getAllPublicUrls(): Promise<string[]> {
  const staticPaths = [
    "/",
    "/services",
    "/products",
    "/courses",
    "/reviews",
    "/blog",
    "/about",
    "/contact",
    "/tools",
  ];
  const postPaths = (await getPublicPosts()).map((p) => `/blog/${p.slug}`);
  
  const courses = await pool.query("SELECT slug FROM courses WHERE published = true");
  const coursePaths = courses.rows.map((c) => `/courses/${c.slug}`);

  const categories = await pool.query("SELECT slug FROM directory_categories");
  const categoryPaths = categories.rows.map((c) => `/tools/${c.slug}`);

  const tools = await pool.query(
    "SELECT t.slug, c.slug AS category_slug FROM directory_tools t JOIN directory_categories c ON c.id = t.category_id WHERE t.status = 'published'"
  );
  const toolPaths = tools.rows.map((t) => `/tools/${t.category_slug}/${t.slug}`);

  return [...staticPaths, ...postPaths, ...coursePaths, ...categoryPaths, ...toolPaths].map((p) => BASE_URL + p);
}
