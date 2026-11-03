"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ATTRIBUTION_COOKIE } from "@/lib/attribution";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function hasAttributionCookie(): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith(`${ATTRIBUTION_COOKIE}=`));
}

/** First-touch only: never overwrite an existing cookie, or a later organic
 * visit would steal credit from whatever campaign actually brought them in. */
function captureAttribution(searchParams: URLSearchParams) {
  if (hasAttributionCookie()) return;

  const data = {
    utm_source: searchParams.get("utm_source"),
    utm_medium: searchParams.get("utm_medium"),
    utm_campaign: searchParams.get("utm_campaign"),
    utm_term: searchParams.get("utm_term"),
    utm_content: searchParams.get("utm_content"),
    referrer: document.referrer || null,
    landing_page: window.location.pathname,
  };
  const maxAge = 60 * 60 * 24 * 90;
  document.cookie = `${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify(data))}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/** Has our server re-set the GA4 and Meta cookies so Safari doesn't expire
 * them after 7 days (see /api/track/cookies). Once per visit, after the tags
 * have loaded and written theirs; straight away after a Meta ad click so
 * _fbc exists even if the pixel is blocked. */
function refreshTrackingCookies(fbclid: string | null) {
  try {
    if (!fbclid && sessionStorage.getItem("im_tc")) return;
    sessionStorage.setItem("im_tc", "1");
  } catch {
    // storage blocked: refreshing on every page is harmless
  }
  const send = () =>
    fetch("/api/track/cookies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fbclid }),
      keepalive: true,
    }).catch(() => {});
  if (fbclid) send();
  setTimeout(send, 8000);
}

export default function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname.startsWith("/console")) return;
    captureAttribution(searchParams);
    refreshTrackingCookies(searchParams.get("fbclid"));
  }, [pathname, searchParams]);

  useEffect(() => {
    if (pathname.startsWith("/console")) return;
    if (typeof window.gtag !== "function") return;
    window.gtag("event", "page_view", {
      page_path: pathname,
      page_location: `${window.location.origin}${pathname}`,
      page_title: document.title,
    });
  }, [pathname]);

  return null;
}
