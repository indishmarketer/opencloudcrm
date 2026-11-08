import type { Metadata } from "next";
import { getCuratedReviewers } from "@/lib/curatedReviews";
import ReviewsGrid, { type SubmittedReview } from "@/components/ReviewsGrid";
import ReviewSubmitForm from "@/components/ReviewSubmitForm";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { serializeJsonLd } from "@/lib/jsonLd";
import { SITE_NAME } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { BuiltInPage, builtInPageMetadata } from "@/components/pageBlocks/SitePageView";
import { getPageGroupToggles, requirePageGroupEnabled } from "@/lib/pageGroupToggles";

export async function generateMetadata(): Promise<Metadata> {
  if (!(await getPageGroupToggles()).reviews) return {};
  return builtInPageMetadata("/reviews", {
    title: "Reviews",
    description: `Reviews of ${SITE_NAME} from customers: written, video, and screenshots.`,
  });
}

export default async function ReviewsPage() {
  await requirePageGroupEnabled("reviews");
  const session = await getSession();
  let reviewerName: string | undefined;
  if (session) {
    const userRow = await pool.query("SELECT name FROM users WHERE id = $1", [session.userId]);
    reviewerName = userRow.rows[0]?.name || session.email;
  }

  const reviewers = await getCuratedReviewers();

  const [approvedResult, googleReviewUrlRow, googleReviewsResult] = await Promise.all([pool.query(
    `SELECT r.id, r.name, r.role, r.rating, r.message, r.created_at, r.screenshots, r.youtube_id,
            u.avatar_url
     FROM review_submissions r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.status = 'approved' AND r.source='WEBSITE' ORDER BY r.created_at DESC LIMIT 100`
  ), pool.query(`SELECT value FROM site_settings WHERE key='google_review_url'`),
  pool.query(`SELECT gr.review_id,gr.reviewer_name,gr.star_rating,gr.comment,gr.create_time
    FROM google_reviews gr JOIN google_business_locations l ON l.id=gr.location_id
    JOIN google_business_connections gc ON gc.id=l.connection_id
    WHERE l.selected=true AND l.show_publicly=true AND gc.disconnected_at IS NULL AND gr.expires_at>now()
    ORDER BY COALESCE(gr.update_time,gr.create_time) DESC LIMIT 50`)]);
  const submissions: SubmittedReview[] = approvedResult.rows;
  const googleReviewUrl: string | null = googleReviewUrlRow.rows[0]?.value || null;
  const googleReviews = googleReviewsResult.rows;

  const totalCount = reviewers.length + submissions.length;
  const avgRating =
    Math.round(
      ((reviewers.reduce((sum, r) => sum + r.rating, 0) +
        submissions.reduce((sum, s) => sum + s.rating, 0)) /
        totalCount) *
        10
    ) / 10;
  const videoCount = reviewers.filter((r) => r.youtubeId).length + submissions.filter((s) => s.youtube_id).length;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Reviews | ${SITE_NAME}`,
    description: `Real reviews from entrepreneurs who worked with ${SITE_NAME}.`,
    url: `${SITE_URL}/reviews`,
    mainEntity: {
      "@type": "Organization",
      name: SITE_NAME,
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: String(avgRating),
        bestRating: "5",
        reviewCount: String(totalCount),
      },
      review: [
        ...reviewers.map((r) => ({
          "@type": "Review",
          author: { "@type": "Person", name: r.name },
          reviewBody: r.text,
          reviewRating: { "@type": "Rating", ratingValue: String(r.rating), bestRating: "5" },
        })),
        ...submissions.map((s) => ({
          "@type": "Review",
          author: { "@type": "Person", name: s.name },
          reviewBody: s.message,
          reviewRating: { "@type": "Rating", ratingValue: String(s.rating), bestRating: "5" },
        })),
      ],
    },
  };

  return (
    <BuiltInPage path="/reviews">
    <div className="mx-auto max-w-6xl px-6 pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <div className="flex flex-wrap gap-3">
        <span className="rounded-full border border-ink/15 bg-paper px-5 py-2 text-sm font-medium">
          {totalCount} reviews
        </span>
        <span className="rounded-full border border-ink/15 bg-paper px-5 py-2 text-sm font-medium">
          {avgRating} avg. rating
        </span>
        <span className="rounded-full border border-ink/15 bg-paper px-5 py-2 text-sm font-medium">
          {videoCount} video reviews
        </span>
      </div>

      <div className="mt-12">
        <ReviewsGrid reviewers={reviewers} submissions={submissions} googleReviews={googleReviews} />
      </div>

      <div className="mt-16 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl font-semibold">Leave a review</h2>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Worked with us? Share your experience, we read every one.
          </p>
          <div className="mt-8 max-w-xl">
            <ReviewSubmitForm loggedIn={!!session} name={reviewerName} />
          </div>
        </div>
        {googleReviewUrl && (
          <div className="rounded-2xl border border-line bg-paper-soft p-8">
            <h2 className="font-display text-2xl font-semibold">Prefer Google?</h2>
            <p className="mt-2 max-w-md text-ink-soft">
              You can also leave your honest review directly on our Google Business Profile.
            </p>
            <a
              href={googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80"
            >
              Leave a Google review
            </a>
          </div>
        )}
      </div>

    </div>
    </BuiltInPage>
  );
}
