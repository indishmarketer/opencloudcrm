import { getPublicPosts } from "@/lib/blogPosts";
import { pool } from "@/lib/db";
import { getActiveLeadMagnet } from "@/lib/leadMagnets";
import { getCuratedReviewers } from "@/lib/curatedReviews";
import { HeroView, LatestCoursesView, LatestPostsView, ReviewsView, num, str, type CourseSummary, type Props } from "@/components/pageBlocks/blockViews";
import type { PopupSettings } from "@/lib/popupsShape";

/** Thin server-only wrapper around blockViews.tsx: the handful of blocks
 * that fetch their own live data (DB queries, next/headers-adjacent code)
 * live here, under their original public names, so PageBlocks.tsx (the
 * public site's async renderer) doesn't need to change. Everything else is
 * re-exported from blockViews.tsx unchanged -- that file has no
 * server-only imports on purpose, since the console page editor's client-
 * side canvas renders those same components directly, pre-fetching this
 * handful of blocks' data once itself (see ConsolePageEditor's liveData
 * prop) instead of importing this file. */
export * from "@/components/pageBlocks/blockViews";

export async function HeroBlock({
  props,
  popup,
}: {
  props: Props;
  popup?: { settings: PopupSettings; content: React.ReactNode };
}) {
  const activeLeadMagnet = str(props, "primaryAction") === "leadMagnet" ? await getActiveLeadMagnet().catch(() => null) : null;
  return <HeroView props={props} activeLeadMagnet={activeLeadMagnet} popup={popup} />;
}

export async function LatestPostsBlock({ props }: { props: Props }) {
  const posts = await getPublicPosts().catch(() => []);
  return <LatestPostsView props={props} posts={posts} />;
}

export async function LatestCoursesBlock({ props }: { props: Props }) {
  const courses = await pool
    .query<CourseSummary>(
      "SELECT slug, title, description, cover_image_url FROM courses WHERE published = true ORDER BY created_at DESC LIMIT $1",
      [num(props, "count", 3)]
    )
    .then((r) => r.rows)
    .catch(() => []);
  return <LatestCoursesView props={props} courses={courses} />;
}

export async function ReviewsBlock({ props }: { props: Props }) {
  const reviewers = await getCuratedReviewers().catch(() => []);
  return <ReviewsView props={props} reviewers={reviewers} />;
}
