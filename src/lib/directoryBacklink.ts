import { fetchSafeHtml } from "@/lib/siteMetadata";
import { SITE_ORIGIN } from "@/lib/directoryFields";
import { SITE_HOSTNAME } from "@/lib/liveSiteUrl";

/**
 * The free tier's condition: the submitter puts our badge on their own site
 * and we go and look for it.
 *
 * What counts as found is a link back to their listing page here, not the
 * badge image. The image is cosmetic and they may well self-host a copy of
 * it, exactly as we briefly did to other directories. The link is the thing
 * that is actually worth something, so the link is what is checked. A
 * `rel="nofollow"` on their side still counts: we are asking for a
 * reciprocal mention, not trying to extract ranking signal from them.
 *
 * Uses the same hardened fetcher as the submit form, because this is the
 * same shape of risk: a server-side request to an address a stranger chose.
 */

export { SITE_ORIGIN };

export type BacklinkResult =
  | { found: true; checkedUrl: string }
  | { found: false; checkedUrl: string; reason: string };

/** Every spelling of a listing URL that should count as a match. */
export function listingUrlVariants(categorySlug: string, slug: string): string[] {
  const path = `/tools/${categorySlug}/${slug}`;
  return [
    `${SITE_ORIGIN}${path}`,
    `https://${SITE_HOSTNAME}${path}`,
    `http://www.${SITE_HOSTNAME}${path}`,
    `http://${SITE_HOSTNAME}${path}`,
    // A protocol-relative or root-relative copy of our own snippet.
    `//www.${SITE_HOSTNAME}${path}`,
  ];
}

/**
 * Looks for a link to `variants` anywhere in the page at `siteUrl`.
 *
 * Plain substring matching on the raw HTML, deliberately. Parsing the
 * document properly would be stricter, but the badge can legitimately sit
 * inside a footer partial, an inlined SVG, a JSON island, or a script that
 * writes it out, and the question being answered is only "did they put our
 * link on their site". A false negative here costs someone their listing,
 * so the check errs toward finding it.
 */
export async function checkBacklink(siteUrl: string, variants: string[]): Promise<BacklinkResult> {
  let html: string;
  let checkedUrl = siteUrl;
  try {
    const result = await fetchSafeHtml(siteUrl);
    html = result.html;
    checkedUrl = result.finalUrl.toString();
  } catch (error) {
    return {
      found: false,
      checkedUrl,
      reason: error instanceof Error ? error.message : "We could not load that page.",
    };
  }

  const haystack = html.toLowerCase();
  const hit = variants.some((variant) => haystack.includes(variant.toLowerCase()));
  if (hit) return { found: true, checkedUrl };

  return {
    found: false,
    checkedUrl,
    reason: "The page loaded, but we could not find a link back to the listing on it.",
  };
}
