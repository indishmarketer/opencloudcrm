import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listActiveAuthorSlugs, getAuthorViewBySlug } from "@/lib/blogAuthors";
import { buildSafe } from "@/lib/db";
import { getPublicPosts } from "@/lib/blogPosts";
import { serializeJsonLd } from "@/lib/jsonLd";
import { defaultAuthorSlug } from "@/data/authors";
import { SITE_URL } from "@/config/brand";
import AuthorSocialLinks from "@/components/SocialIcon";

const PER_PAGE = 12;

// Revalidates every 5 minutes so edits made in Console -> Blog authors show
// up without needing a full site redeploy (the blog itself stays static
// JSON files, this page just also reads the author's own DB row).
export const revalidate = 300;

// See the same note on blog/[slug]/page.tsx.
export async function generateStaticParams() {
  return buildSafe(async () => (await listActiveAuthorSlugs()).map((slug) => ({ slug })), []);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const author = await getAuthorViewBySlug(slug);
  if (!author) return {};
  return {
    title: author.name,
    description: author.bio,
  };
}

export default async function AuthorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const author = await getAuthorViewBySlug(slug);
  if (!author) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: author.name,
    jobTitle: author.role,
    description: author.bio,
    url: `${SITE_URL}/author/${author.slug}`,
    sameAs: author.social.map((s) => s.url),
  };

  // Posts without an author field belong to the default author.
  const postsIndex = (await getPublicPosts()).filter((p) => (p.author || defaultAuthorSlug) === author.slug);
  const page = Math.max(1, parseInt(pageParam || "1", 10) || 1);
  const totalPages = Math.max(1, Math.ceil(postsIndex.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const posts = postsIndex.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        {author.avatar ? (
          <div className="relative h-20 w-20 overflow-hidden rounded-full">
            <Image src={author.avatar} alt={author.name} fill className="object-cover" />
          </div>
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-ink text-2xl font-semibold text-paper">
            {author.name
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </div>
        )}
        <div>
          <h1 className="font-display text-3xl font-semibold">{author.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">{author.role}</p>
        </div>
      </div>

      <p className="mt-8 max-w-2xl text-sm leading-6 text-ink-soft">{author.bio}</p>

      {author.social.length > 0 && (
        <div className="mt-6">
          <AuthorSocialLinks links={author.social} authorName={author.name} nofollow={author.slug !== defaultAuthorSlug} />
        </div>
      )}

      <div className="mt-16">
        <h2 className="font-display text-2xl font-semibold">
          Posts by {author.name} ({postsIndex.length})
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {posts.map((p) => (
            <Link
              key={p.slug}
              href={`/blog/${p.slug}`}
              className="rounded-2xl border border-line p-6 transition-colors hover:border-ink"
            >
              <h3 className="font-display text-base font-semibold leading-snug">{p.title}</h3>
              <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{p.excerpt}</p>
            </Link>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={n === 1 ? `/author/${slug}` : `/author/${slug}?page=${n}`}
                className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm ${
                  n === currentPage
                    ? "border-ink bg-ink text-paper"
                    : "border-line text-ink-soft hover:border-ink"
                }`}
              >
                {n}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
