import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveImage } from "@/lib/images";
import { getPublicPost, getPublicPosts, getPostBySlug } from "@/lib/blogPosts";
import BlogPostArticle, { type FullPost } from "@/components/BlogPostArticle";
import { SITE_NAME, SITE_URL, OG_LOCALE } from "@/config/brand";

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

// Drafts are left out here; once published from the console they render
// on demand.
export async function generateStaticParams() {
  return (await getPublicPosts()).map((p) => ({ slug: p.slug }));
}

// Content now lives in Postgres (not just RelatedTools' directory_tools
// query), so this also picks up a post edited after the last build.
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const row = await getPostBySlug(slug);
  const indexEntry = await getPublicPost(slug);
  if (!row || !indexEntry) return {};
  const post = toFullPost(row);
  const ogImageUrl = resolveImage(post.og_image || post.feature_image);
  const title = post.meta_title || post.title;
  return {
    title,
    description: post.meta_description || post.custom_excerpt || undefined,
    alternates: { canonical: "/blog/" + post.slug },
    openGraph: {
      title,
      description: post.meta_description || post.custom_excerpt || undefined,
      url: SITE_URL + "/blog/" + post.slug,
      siteName: SITE_NAME,
      locale: OG_LOCALE,
      images: ogImageUrl
        ? [{ url: ogImageUrl, width: 1200, height: 650, alt: title }]
        : undefined,
      type: "article",
      publishedTime: indexEntry.published_at,
      modifiedTime: post.sources_reviewed_at || undefined,
    },
  };
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const row = await getPostBySlug(slug);
  // An unpublished draft 404s here; it is only reachable through its
  // preview link (/blog/preview/<slug>).
  const indexEntry = await getPublicPost(slug);
  if (!row || !indexEntry) notFound();

  return <BlogPostArticle post={toFullPost(row)} indexEntry={indexEntry} />;
}
