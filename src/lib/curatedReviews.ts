import { cache } from "react";
import { pool } from "@/lib/db";
import { reviewers as defaultReviewers, type Reviewer } from "@/data/reviews";

const CURATED_REVIEWS_KEY = "curated_reviews";

/** Server-only, never throws. The hand-picked testimonials on /reviews and
 * the homepage used to be hardcoded in src/data/reviews.ts, which meant every
 * self-hosted deployment shipped this site's own real customer testimonials
 * by default. They now live in site_settings instead, the same way business
 * details and site pages do, so a deployment's own curated reviews are never
 * baked into the repo. A missing row (a fresh install, or the table not
 * reachable yet) falls back to the small example set in src/data/reviews.ts. */
export const getCuratedReviewers = cache(async (): Promise<Reviewer[]> => {
  try {
    const result = await pool.query<{ value: string }>("SELECT value FROM site_settings WHERE key = $1", [
      CURATED_REVIEWS_KEY,
    ]);
    if (result.rows[0]) return JSON.parse(result.rows[0].value);
  } catch (error) {
    console.error("curated reviews: could not read from site_settings, using the built-in defaults.", error);
  }
  return defaultReviewers;
});
