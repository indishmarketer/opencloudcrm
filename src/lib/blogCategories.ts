import { cache } from "react";
import { pool } from "@/lib/db";
import fallbackCategories from "@/data/blog-categories.json";

export const BLOG_CATEGORIES_KEY = "blog_categories";

export type BlogCategory = {
  id: number;
  slug: string;
  name: string;
  description: string;
  image: string;
  image_alt: string;
  position: number;
};

export const getBlogCategories = cache(async (): Promise<BlogCategory[]> => {
  try {
    const result = await pool.query<{ value: string }>("SELECT value FROM site_settings WHERE key=$1", [BLOG_CATEGORIES_KEY]);
    if (result.rows[0]) {
      const parsed: unknown = JSON.parse(result.rows[0].value);
      if (Array.isArray(parsed)) return parsed.filter((item): item is BlogCategory =>
        item && typeof item === "object" && typeof item.slug === "string" && typeof item.name === "string"
      ).map((item, index) => ({
        id: Number.isSafeInteger(item.id) ? item.id : index + 1,
        slug: item.slug,
        name: item.name,
        description: typeof item.description === "string" ? item.description : "",
        image: typeof item.image === "string" ? item.image : "",
        image_alt: typeof item.image_alt === "string" ? item.image_alt : "",
        position: Number.isSafeInteger(item.position) ? item.position : index,
      })).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    }
  } catch (error) {
    console.error("blog categories: could not read saved settings; using bundled defaults.", error);
  }
  return fallbackCategories.map((category, index) => ({ ...category, id: index + 1, image_alt: category.name, position: index }));
});

export async function blogCategoryExists(slug: string): Promise<boolean> {
  if (!slug) return false;
  return (await getBlogCategories()).some((category) => category.slug === slug);
}

export async function saveBlogCategories(categories: BlogCategory[]): Promise<void> {
  await pool.query(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [BLOG_CATEGORIES_KEY, JSON.stringify(categories)]
  );
}

export const blogCategorySlug = (name: string) => name.toLowerCase().trim().normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
