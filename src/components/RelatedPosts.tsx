import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import { getPublicPosts } from "@/lib/blogPosts";
import { getBlogCategories } from "@/lib/blogCategories";
import { resolveImage } from "@/lib/images";


export default async function RelatedPosts({
  currentSlug,
  category,
}: {
  currentSlug: string;
  category?: string;
}) {
  const postsIndex = await getPublicPosts();
  const categoryMap = new Map((await getBlogCategories()).map((c) => [c.slug, c.name]));
  const byDateDesc = (a: { published_at: string }, b: { published_at: string }) =>
    new Date(b.published_at).getTime() - new Date(a.published_at).getTime();

  const sameCategory = postsIndex
    .filter((p) => p.slug !== currentSlug && p.category === category)
    .sort(byDateDesc);
  const rest = postsIndex
    .filter((p) => p.slug !== currentSlug && p.category !== category)
    .sort(byDateDesc);

  const related = [...sameCategory, ...rest].slice(0, 3);

  if (related.length === 0) return null;

  return (
    <div className="mt-16 border-t border-line pt-10">
      <h2 className="font-display text-xl font-semibold">Related Posts</h2>
      <div className="mt-6 grid gap-8 sm:grid-cols-3">
        {related.map((post) => {
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
