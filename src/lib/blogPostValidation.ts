import { blogCategoryExists } from "@/lib/blogCategories";
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Shared by the create and edit console API routes -- the editor always
 * submits the full form state, never a sparse patch. */
export async function validateBlogPostBody(body: Record<string, unknown>): Promise<string | null> {
  const { slug, title, html, status, category } = body;
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) return "Enter a lowercase, hyphenated slug.";
  if (typeof title !== "string" || !title.trim()) return "Title is required.";
  if (typeof html !== "string" || !html.trim()) return "The post body can't be empty.";
  if (status !== "draft" && status !== "published") return "Invalid status.";
  if (typeof category !== "string" || !(await blogCategoryExists(category))) return "Choose a valid category.";
  return null;
}

export function isForeignKeyViolation(err: unknown): boolean {
  return err instanceof Error && "code" in err && (err as { code?: unknown }).code === "23503";
}

/** Drops anything from the submitted sources list that isn't a genuine
 * {label, url} pair with an http(s) URL, rather than rejecting the whole
 * save over one bad row -- the editor's own UI never produces one, but a
 * script hitting this API directly could. */
export function normalizeBlogSources(value: unknown): { label: string; url: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const label = String((entry as { label?: unknown }).label || "").trim().slice(0, 200);
      const url = String((entry as { url?: unknown }).url || "").trim().slice(0, 500);
      if (!label || !url) return null;
      try {
        if (!["http:", "https:"].includes(new URL(url).protocol)) return null;
      } catch {
        return null;
      }
      return { label, url };
    })
    .filter((entry): entry is { label: string; url: string } => entry !== null)
    .slice(0, 30);
}
