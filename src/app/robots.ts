import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
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
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
