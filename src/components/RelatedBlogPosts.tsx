import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import { getBlogCategories } from "@/lib/blogCategories";
import { resolveImage } from "@/lib/images";
import { getRelatedPostsForTool } from "@/lib/relatedBlogPosts";
import type { DirectoryTool } from "@/lib/directory";


export default async function RelatedBlogPosts({
  tool,
}: {
  tool: Pick<DirectoryTool, "name" | "website_url" | "category_name">;
}) {
  const posts = await getRelatedPostsForTool(tool);
  const categoryMap = new Map((await getBlogCategories()).map((c) => [c.slug, c.name]));
  if (posts.length === 0) return null;

  return (
    <div className="mt-16 border-t border-line pt-10">
      <h2 className="font-display text-xl font-semibold">From the blog</h2>
      <div className="mt-6 grid gap-6 sm:grid-cols-3">
        {posts.map((post) => {
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
                    sizes="(min-width: 640px) 33vw, 100vw"
                    className="object-contain transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2 p-5">
                {categoryName && (
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                    {categoryName}
                  </span>
                )}
                <h3 className="font-display text-base font-semibold leading-snug">{post.title}</h3>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
