import { NextRequest } from "next/server";

export const ATTRIBUTION_COOKIE = "im_attribution";

export type Attribution = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer: string | null;
  landing_page: string | null;
};

const EMPTY: Attribution = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_term: null,
  utm_content: null,
  referrer: null,
  landing_page: null,
};

export function getAttributionFromRequest(req: NextRequest): Attribution {
  const raw = req.cookies.get(ATTRIBUTION_COOKIE)?.value;
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    return {
      utm_source: parsed.utm_source || null,
      utm_medium: parsed.utm_medium || null,
      utm_campaign: parsed.utm_campaign || null,
      utm_term: parsed.utm_term || null,
      utm_content: parsed.utm_content || null,
      referrer: parsed.referrer || null,
      landing_page: parsed.landing_page || null,
    };
  } catch {
    return EMPTY;
  }
}
