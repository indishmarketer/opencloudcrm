import { getCuratedReviewers } from "@/lib/curatedReviews";
import { pool } from "@/lib/db";

export type ReviewStats = { averageRating: number; totalCount: number };

/** Shared with the Reviews page's own `aggregateRating` JSON-LD -- same
 * source (curated reviewers + approved website submissions), so any page
 * referencing this never disagrees with what /reviews itself reports. */
export async function getReviewStats(): Promise<ReviewStats> {
  const [reviewers, result] = await Promise.all([
    getCuratedReviewers(),
    pool.query("SELECT rating FROM review_submissions WHERE status = 'approved' AND source = 'WEBSITE'"),
  ]);
  const submittedRatings: number[] = result.rows.map((r) => Number(r.rating));
  const totalCount = reviewers.length + submittedRatings.length;
  if (totalCount === 0) return { averageRating: 0, totalCount: 0 };
  const sum = reviewers.reduce((s, r) => s + r.rating, 0) + submittedRatings.reduce((s, r) => s + r, 0);
  return { averageRating: Math.round((sum / totalCount) * 10) / 10, totalCount };
}
