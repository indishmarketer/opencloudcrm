"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Stars from "@/components/Stars";
import type { Reviewer } from "@/data/reviews";

export type SubmittedReview = {
  id: number;
  name: string;
  role: string;
  rating: number;
  message: string;
  created_at: string;
  avatar_url: string | null;
  youtube_id: string | null;
  screenshots: string[];
};
export type GoogleReview = { review_id:string; reviewer_name:string|null; star_rating:number; comment:string|null; create_time:string|null };

export default function ReviewsGrid({
  reviewers,
  submissions = [],
  googleReviews = [],
}: {
  reviewers: Reviewer[];
  submissions?: SubmittedReview[];
  googleReviews?: GoogleReview[];
}) {
  const [filter, setFilter] = useState<number | "all">("all");
  const total = reviewers.length + submissions.length;
  const filteredReviewers = filter === "all" ? reviewers : reviewers.filter((r) => r.rating === filter);
  const filteredSubmissions = filter === "all" ? submissions : submissions.filter((s) => s.rating === filter);

  const counts = [5, 4, 3, 2, 1].map((n) => ({
    n,
    count:
      reviewers.filter((r) => r.rating === n).length + submissions.filter((s) => s.rating === n).length,
  }));

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
            filter === "all" ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
          }`}
        >
          All ({total})
        </button>
        {counts.map(
          ({ n, count }) =>
            count > 0 && (
              <button
                key={n}
                onClick={() => setFilter(n)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  filter === n ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
                }`}
              >
                {n} star ({count})
              </button>
            )
        )}
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {filteredReviewers.map((r) => (
          <Link
            key={r.slug}
            href={`/reviews/${r.slug}`}
            className="flex flex-col rounded-2xl border border-line p-8 transition-colors hover:border-ink"
          >
            <span className="mb-3 w-fit rounded-full bg-paper-soft px-2 py-1 text-xs font-medium text-ink-soft">Website review</span>
            <Stars count={r.rating} />
            <p className="mt-4 line-clamp-4 text-sm leading-6 text-ink-soft">&ldquo;{r.text}&rdquo;</p>
            <div className="mt-6 flex items-center gap-3">
              {r.avatar ? (
                <div className="relative h-11 w-11 overflow-hidden rounded-full">
                  <Image src={r.avatar} alt={r.name} fill className="object-cover" />
                </div>
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-sm font-semibold text-paper">
                  {r.name[0]}
                </div>
              )}
              <div>
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-xs text-ink-soft">{r.role}</p>
              </div>
              {r.youtubeId && (
                <span className="ml-auto rounded-full bg-paper-soft px-2 py-1 text-xs font-medium text-ink-soft">
                  Video
                </span>
              )}
            </div>
          </Link>
        ))}
        {filteredSubmissions.map((s) => (
          <Link
            key={`submission-${s.id}`}
            href={`/reviews/review-${s.id}`}
            className="flex flex-col rounded-2xl border border-line p-8 transition-colors hover:border-ink"
          >
            <span className="mb-3 w-fit rounded-full bg-paper-soft px-2 py-1 text-xs font-medium text-ink-soft">Website review</span>
            <Stars count={s.rating} />
            <p className="mt-4 line-clamp-4 text-sm leading-6 text-ink-soft">&ldquo;{s.message}&rdquo;</p>
            <div className="mt-6 flex items-center gap-3">
              {s.avatar_url ? (
                // Reviewer avatars are the account's own uploaded avatar_url,
                // which (like community Avatar.tsx) can be from any host --
                // not run through next/image's domain allowlist.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.avatar_url}
                  alt={s.name}
                  className="h-11 w-11 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-sm font-semibold text-paper">
                  {s.name[0]}
                </div>
              )}
              <div>
                <p className="text-sm font-medium">{s.name}</p>
                {s.role && <p className="text-xs text-ink-soft">{s.role}</p>}
              </div>
              {s.youtube_id && (
                <span className="ml-auto rounded-full bg-paper-soft px-2 py-1 text-xs font-medium text-ink-soft">
                  Video
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
      {googleReviews.length>0&&<div className="mt-12"><div className="flex items-center justify-between gap-4"><div><h2 className="font-display text-2xl font-semibold">Recent Google reviews</h2><p className="mt-1 text-sm text-ink-soft">Shown separately from reviews submitted on this website.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">Google</span></div><div className="mt-6 grid gap-6 md:grid-cols-2">{googleReviews.map((review)=><article key={review.review_id} className="rounded-2xl border border-line p-8"><Stars count={review.star_rating}/>{review.comment&&<p className="mt-4 text-sm leading-6 text-ink-soft">&ldquo;{review.comment}&rdquo;</p>}<div className="mt-5 flex items-center justify-between gap-3"><p className="text-sm font-medium">{review.reviewer_name||"Google user"}</p><span className="text-xs font-medium text-blue-800">Google review</span></div></article>)}</div></div>}
    </div>
  );
}
