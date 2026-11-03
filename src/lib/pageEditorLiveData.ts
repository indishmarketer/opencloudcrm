import { pool } from "@/lib/db";
import { getBusiness } from "@/lib/businessProfile";
import { getActiveLeadMagnet } from "@/lib/leadMagnets";
import { getPublicPosts } from "@/lib/blogPosts";
import { getCuratedReviewers } from "@/lib/curatedReviews";
import type { CourseSummary } from "@/components/pageBlocks/blockViews";

/** Pre-fetched once per page-editor load (both console/pages/[id] and a
 * course/tool's extra-sections editor use this) so the editor's live
 * canvas can render the handful of blocks that normally fetch their own
 * data server-side (Hero's active lead magnet, latest posts/courses,
 * reviews) without needing its own DB access -- see blockViews.tsx's note
 * on why those components take this data as a prop instead of fetching it
 * themselves. */
export async function getPageEditorLiveData() {
  const [business, activeLeadMagnet, posts, courses, reviewers] = await Promise.all([
    getBusiness(),
    getActiveLeadMagnet().catch(() => null),
    getPublicPosts().catch(() => []),
    pool
      .query<CourseSummary>("SELECT slug, title, description, cover_image_url FROM courses WHERE published = true ORDER BY created_at DESC LIMIT 12")
      .then((r) => r.rows)
      .catch(() => []),
    getCuratedReviewers().catch(() => []),
  ]);
  return { business, activeLeadMagnet, posts, courses, reviewers };
}

export type PageEditorLiveData = Awaited<ReturnType<typeof getPageEditorLiveData>>;
