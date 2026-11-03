import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCuratedReviewers } from "@/lib/curatedReviews";
import { pool } from "@/lib/db";
import Stars from "@/components/Stars";
import { serializeJsonLd } from "@/lib/jsonLd";
import { SITE_NAME } from "@/config/brand";

type ReviewDetail = {
  name: string;
  role: string;
  bio: string | null;
  avatar: string | null;
  rating: number;
  text: string;
  youtubeId: string | null;
  screenshots: string[];
  nameConfirmed: boolean;
};

async function getReviewDetail(slug: string): Promise<ReviewDetail | null> {
  const reviewers = await getCuratedReviewers();
  const reviewer = reviewers.find((r) => r.slug === slug);
  if (reviewer) {
    return {
      name: reviewer.name,
      role: reviewer.role,
      bio: reviewer.bio,
      avatar: reviewer.avatar,
      rating: reviewer.rating,
      text: reviewer.text,
      youtubeId: reviewer.youtubeId || null,
      screenshots: reviewer.screenshots || [],
      nameConfirmed: reviewer.nameConfirmed,
    };
  }

  // Submitted reviews (from /reviews's own form) use a "review-<id>" slug
  // instead of a hand-picked one -- only approved submissions are ever
  // reachable this way, same gate the grid on /reviews uses.
  const match = slug.match(/^review-(\d+)$/);
  if (!match) return null;

  const result = await pool.query(
    `SELECT r.name, r.role, r.rating, r.message, r.screenshots, r.youtube_id, u.avatar_url
     FROM review_submissions r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.id = $1 AND r.status = 'approved'`,
    [match[1]]
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    name: row.name,
    role: row.role || "",
    bio: null,
    avatar: row.avatar_url,
    rating: row.rating,
    text: row.message,
    youtubeId: row.youtube_id,
    screenshots: row.screenshots || [],
    nameConfirmed: true,
  };
}

export async function generateStaticParams() {
  const reviewers = await getCuratedReviewers();
  return reviewers.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const review = await getReviewDetail(slug);
  if (!review) return {};
  return {
    title: `${review.name}'s review`,
    description: review.text,
  };
}

export default async function ReviewerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const review = await getReviewDetail(slug);
  if (!review) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Review",
    author: { "@type": "Person", name: review.name, jobTitle: review.role },
    reviewBody: review.text,
    reviewRating: { "@type": "Rating", ratingValue: String(review.rating), bestRating: "5" },
    itemReviewed: { "@type": "Organization", name: SITE_NAME },
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <Link href="/reviews" className="text-sm text-ink-soft hover:text-ink">
        &larr; All reviews
      </Link>

      <div className="mt-6 flex items-center gap-4">
        {review.avatar ? (
          // Avatar can be a hand-picked testimonial photo or a user's own
          // account avatar_url (any host, like community Avatar.tsx) -- not
          // run through next/image's domain allowlist.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={review.avatar} alt={review.name} className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ink text-xl font-semibold text-paper">
            {review.name[0]}
          </div>
        )}
        <div>
          <h1 className="font-display text-2xl font-semibold">{review.name}</h1>
          {review.role && <p className="text-sm text-ink-soft">{review.role}</p>}
        </div>
      </div>

      {!review.nameConfirmed && (
        <p className="mt-4 text-xs text-ink-soft">
          Name not visible in the original message, a placeholder name is used here.
        </p>
      )}

      <div className="mt-6">
        <Stars count={review.rating} />
      </div>

      <p className="mt-6 text-lg leading-8 text-ink-soft">&ldquo;{review.text}&rdquo;</p>

      {review.youtubeId && (
        <div className="relative mt-10 aspect-video w-full overflow-hidden rounded-2xl">
          <iframe
            src={`https://www.youtube.com/embed/${review.youtubeId}`}
            title={`${review.name} video review`}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {!!review.screenshots.length && (
        <div className="mt-10">
          <h2 className="font-display text-lg font-semibold">Proof</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {review.screenshots.map((src) => (
              <a
                key={src}
                href={src}
                target="_blank"
                rel="noreferrer"
                className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-line bg-paper-soft"
              >
                <Image
                  src={src}
                  alt={`${review.name} screenshot`}
                  fill
                  sizes="(min-width: 640px) 50vw, 100vw"
                  className="object-cover transition-transform duration-300 hover:scale-105"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {review.bio && (
        <div className="mt-10 rounded-2xl border border-line p-6">
          <h2 className="font-display text-lg font-semibold">About {review.name}</h2>
          <p className="mt-2 text-sm leading-6 text-ink-soft">{review.bio}</p>
        </div>
      )}
    </div>
  );
}
