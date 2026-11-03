import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAllPostsIncludingDrafts, getPostBySlug, getPublicPost, isValidDraftPreviewKey } from "@/lib/blogPosts";
import BlogPostArticle, { type FullPost } from "@/components/BlogPostArticle";

export const metadata: Metadata = {
  title: "Draft preview",
  robots: { index: false, follow: false },
};

function toFullPost(row: NonNullable<Awaited<ReturnType<typeof getPostBySlug>>>): FullPost {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    html: row.html,
    feature_image: row.feature_image,
    feature_image_alt: row.feature_image_alt,
    status: row.status,
    published_at: row.published_at || row.updated_at,
    updated_at: row.updated_at,
    custom_excerpt: row.excerpt,
    meta_title: row.meta_title,
    meta_description: row.meta_description,
    og_image: row.og_image,
    sources: row.sources,
    sources_reviewed_at: row.sources_reviewed_at,
  };
}

/** Private preview of an unpublished draft, opened with the link from
 * /console/blog. Once the post is published it redirects to the real page. */
export default async function BlogDraftPreview({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const { key } = await searchParams;
  if (!isValidDraftPreviewKey(slug, typeof key === "string" ? key : undefined)) notFound();
  if (await getPublicPost(slug)) redirect(`/blog/${slug}`);

  const row = await getPostBySlug(slug);
  if (!row) notFound();
  const indexEntry = (await getAllPostsIncludingDrafts()).find((p) => p.slug === slug);

  return <BlogPostArticle post={toFullPost(row)} indexEntry={indexEntry} preview />;
}
