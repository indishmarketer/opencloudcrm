import { assetUrl, OG_ASSET_VERSION } from "@/config/brand";
import { getSiteIdentity } from "@/lib/siteIdentity";

/** The share image a page falls back to when it has none of its own.
 *
 * This exists because Next.js replaces `openGraph` wholesale rather than
 * merging it: the root layout sets a perfectly good default image, and
 * the moment any page declares an `openGraph` block of its own without
 * `images`, that default is gone and the page ships with no og:image at
 * all. Twitter then downgrades the card from a large image to a bare
 * text summary. Measured on the live site, that was happening on the
 * home page, About, Blog, Courses, Reviews, Tools, Terms, the refund
 * policy and the booking page -- every page-builder route that had no
 * per-page image set, which is most of them.
 *
 * So any route declaring its own openGraph should end with
 * `images: await defaultOgImages()` unless it has something better. */

/** Site-wide brand image, used when the console has no OG image set. */
export const BRAND_OG_IMAGE = `${assetUrl("brand/og-default.png")}?v=${OG_ASSET_VERSION}`;

/** 1200x630 is the size both Facebook and Twitter crop toward; stating it
 * lets a crawler lay out the card before it has fetched the file. */
export function ogImagesFrom(ogImageUrl?: string | null) {
  return [{ url: ogImageUrl || BRAND_OG_IMAGE, width: 1200, height: 630 }];
}

/** The console-set OG image (Site Settings), else the brand default.
 * Callers that already hold the site identity should use ogImagesFrom
 * directly rather than paying for the lookup twice. */
export async function defaultOgImages() {
  return ogImagesFrom((await getSiteIdentity()).ogImageUrl);
}
