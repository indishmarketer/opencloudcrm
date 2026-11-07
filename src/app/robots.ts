import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/brand";
import { getCrawlSettings } from "@/lib/siteCrawlSettings";

export default async function robots(): Promise<MetadataRoute.Robots> {
  // getCrawlSettings never throws (readCrawlSettings falls back to no
  // extra rules on a DB hiccup) -- the protected disallow list below
  // always applies regardless.
  const extra = await getCrawlSettings();
  return {
    rules: {
      userAgent: "*",
      allow: ["/", ...extra.robotsExtraAllow],
      disallow: [
        "/console",
        "/console/",
        "/account",
        "/account/",
        "/reset-password",
        "/verify-email",
        "/forgot-password",
        "/community/pro",
        "/community/pro/",
        "/community/admin",
        "/community/admin/",
        "/community/settings",
        "/community/settings/",
        "/community/messages",
        "/community/messages/",
        "/api/",
        // Webinar landing pages are public, but account-specific rooms,
        // playback tokens, chat, quizzes, and scheduled sessions are private.
        "/webinars/*/room",
        // The self-service reschedule/cancel page -- carries a signed,
        // per-booking token in the URL, only ever reached via a private
        // confirmation-email link. /book/[slug] itself (the actual
        // discovery/booking page, e.g. /book/discovery-call) stays
        // crawlable -- that's the one meetings page meant to be found; only
        // this /book/manage/* subpath is excluded.
        "/book/manage",
        "/book/manage/",
        // Prompt & Skill Library (landing, browse, and every prompt/skill/
        // guide detail page) is fully public and crawlable -- 2026-09-20,
        // owner decided the library itself should drive signups via
        // on-page CTAs rather than gating it behind login.

        // Owner's own additions from /console/site-actions, below the
        // built-in list above. normalizeCrawlSettings already strips out
        // anything that would touch a protected path.
        ...extra.robotsExtraDisallow,
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
