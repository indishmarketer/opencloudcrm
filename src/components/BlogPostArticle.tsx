import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import { getBlogCategories } from "@/lib/blogCategories";
import { resolveImage } from "@/lib/images";
import { getAuthorViewBySlug, getDefaultAuthorView } from "@/lib/blogAuthors";
import AuthorByline from "@/components/AuthorByline";
import ShareButtons from "@/components/ShareButtons";
import NewsletterPopup from "@/components/NewsletterPopup";
import BlogCommentSection from "@/components/community/BlogCommentSection";
import RelatedPosts from "@/components/RelatedPosts";
import RelatedTools from "@/components/RelatedTools";
import { getRelatedToolsForPost } from "@/lib/relatedBlogPosts";
import { serializeJsonLd } from "@/lib/jsonLd";
import { sanitizeBlogHtml } from "@/lib/sanitizeBlogHtml";
import { buildTableOfContents } from "@/lib/tableOfContents";
import AuthorSocialLinks from "@/components/SocialIcon";
import type { BlogIndexEntry, BlogSource } from "@/lib/blogPosts";
import { SITE_NAME } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";

export type FullPost = {
  id: string;
  title: string;
  slug: string;
  html: string;
  feature_image: string | null;
  feature_image_alt: string | null;
  status: string;
  published_at: string;
  updated_at: string;
  custom_excerpt: string | null;
  meta_title: string | null;
  meta_description: string | null;
  og_image: string | null;
  sources: BlogSource[];
  sources_reviewed_at: string | null;
};

function resolveHtml(html: string) {
  return sanitizeBlogHtml(html.replaceAll("__GHOST_URL__", SITE_URL));
}

/** The article body shared by the public post page and the private draft
 * preview. `preview` adds a draft notice and leaves out comments, the
 * newsletter popup and the structured data. */
export default async function BlogPostArticle({ post, indexEntry, preview = false }: {
  post: FullPost;
  indexEntry?: BlogIndexEntry;
  preview?: boolean;
}) {
  const guestAuthor = indexEntry?.author ? await getAuthorViewBySlug(indexEntry.author) : null;
  const author = guestAuthor || (await getDefaultAuthorView());
  const img = resolveImage(post.feature_image);
  const publishedAt = indexEntry?.published_at || post.published_at;
  const date = new Date(publishedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const titleYears = Array.from(post.title.matchAll(/\b(20\d{2})\b/g), (match) => Number(match[1]));
  const latestTitleYear = titleYears.length ? Math.max(...titleYears) : null;
  const hasArchivedYear = latestTitleYear !== null && latestTitleYear < new Date().getUTCFullYear();
  const reviewedDate = post.sources_reviewed_at
    ? new Date(post.sources_reviewed_at + "T00:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })
    : null;

  const category = (await getBlogCategories()).find((c) => c.slug === indexEntry?.category);
  const relatedTools = indexEntry ? await getRelatedToolsForPost(indexEntry) : [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.meta_description || post.custom_excerpt || undefined,
    image: img || undefined,
    articleSection: category?.name || undefined,
    datePublished: publishedAt,
    dateModified: post.sources_reviewed_at || publishedAt,
    citation: post.sources.length ? post.sources.map((source) => source.url) : undefined,
    author: {
      "@type": "Person",
      name: author.name,
      url: `${SITE_URL}/author/${author.slug}`,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
  };

  const fullHtml = buildTableOfContents(resolveHtml(post.html));

  return (
    <article className="mx-auto max-w-3xl px-6 py-20">
      {preview ? (
        <aside className="mb-8 rounded-2xl border border-red-600 p-4 text-sm">
          <strong className="text-red-600">Draft preview.</strong> This post is not published yet. Only people with this link can see it.
        </aside>
      ) : (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}

      {category && (
        <Link
          href={`/blog/category/${category.slug}`}
          className="text-xs font-medium uppercase tracking-wide text-ink-soft hover:text-ink"
        >
          {category.name}
        </Link>
      )}
      <h1 className="mt-2 font-display text-4xl font-semibold leading-tight">{post.title}</h1>
      {post.custom_excerpt && (
        <p className="mt-4 text-lg text-ink-soft">{post.custom_excerpt}</p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <AuthorByline author={author} date={date} />
        </div>
        <ShareButtons title={post.title} url={`${SITE_URL}/blog/${post.slug}`} />
      </div>
      {img && (
        <div className="relative mt-10 aspect-[1200/650] w-full overflow-hidden rounded-xl border border-ink/15 bg-paper-soft">
          <SafeImage src={img} alt={post.feature_image_alt || post.title} fill className="object-contain" priority />
        </div>
      )}
      {hasArchivedYear && (
        <aside className="mt-8 rounded-2xl border border-line bg-paper-soft p-4 text-sm text-ink">
          <strong>Edition note:</strong> This article covers the {latestTitleYear} edition. Features, pricing, and availability may have changed; follow the linked primary sources for current details.
        </aside>
      )}
      <div
        className="prose prose-neutral mt-10 max-w-none prose-headings:font-display prose-a:text-ink prose-a:underline prose-img:w-full prose-img:h-auto [&_img+p]:mt-2 [&_img+p]:text-center [&_img+p]:text-sm [&_img+p]:italic [&_img+p]:text-ink-soft [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-line [&_th]:border [&_th]:border-line [&_td]:p-2 [&_th]:p-2 [&_th]:bg-paper-soft"
        dangerouslySetInnerHTML={{ __html: fullHtml }}
      />
      {post.sources.length > 0 && (
        <aside className="mt-12 rounded-2xl border border-line bg-paper-soft p-6" aria-labelledby="article-sources">
          <h2 id="article-sources" className="font-display text-xl font-semibold">Sources and further reading</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Primary documentation and consumer guidance checked for this article.
            {reviewedDate && <> Last reviewed {reviewedDate}.</>}
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
            {post.sources.map((source) => (
              <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">{source.label}</a></li>
            ))}
          </ul>
        </aside>
      )}
      <div className="mt-10">
        <ShareButtons title={post.title} url={`${SITE_URL}/blog/${post.slug}`} />
      </div>
      <div className="mt-16 border-t border-line pt-8">
        <AuthorByline author={author} />
        <p className="mt-4 max-w-xl text-sm leading-6 text-ink-soft">{author.bio}</p>
        {author.social.length > 0 && (
          <div className="mt-4">
            <AuthorSocialLinks links={author.social} authorName={author.name} nofollow={!!guestAuthor} />
          </div>
        )}
      </div>
      <RelatedTools tools={relatedTools} />
      <RelatedPosts currentSlug={post.slug} category={indexEntry?.category} />
      {!preview && <BlogCommentSection postSlug={post.slug} />}
      {!preview && <NewsletterPopup />}
    </article>
  );
}
