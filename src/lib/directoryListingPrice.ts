import { pool } from "@/lib/db";
import { getCoursePrices, type CoursePrices } from "@/lib/currency";

/** The key in `site_settings`. One number, always USD, because the INR
 * figure is derived from the live rate the same way course prices are. */
export const LISTING_PRICE_KEY = "directory_listing_price_usd";

/** What the paid tier cost before it was configurable. Also the value used
 * if the setting is missing or unreadable, so a bad row cannot make the
 * listing free or stop checkout working. */
export const DEFAULT_LISTING_PRICE_USD = 5;

/** Guard rails on what the console will accept. A fat-fingered 0 would
 * hand out free paid listings; a fat-fingered 5000 would look like fraud
 * to the person at the checkout. */
export const MIN_LISTING_PRICE_USD = 1;
export const MAX_LISTING_PRICE_USD = 500;

export type DirectoryListingPrice = {
  /** What the owner set, in whole dollars. */
  usd: number;
  /** Both currencies at the live rate: `inr` is charged by Razorpay, `usd`
   * by PayPal, exactly as for a course. */
  prices: CoursePrices;
};

/**
 * The current paid-listing price.
 *
 * Every checkout path reads this rather than a literal 5 -- the two
 * create-order routes, the submit flow, `/account/tools` and the console --
 * so changing the number in the console changes what is charged, with no
 * redeploy. The amount is never taken from the request body: a client that
 * could name its own price would be the whole bug.
 */
export async function getDirectoryListingPrice(): Promise<DirectoryListingPrice> {
  let usd = DEFAULT_LISTING_PRICE_USD;
  try {
    const result = await pool.query<{ value: string }>(
      "SELECT value FROM site_settings WHERE key = $1",
      [LISTING_PRICE_KEY],
    );
    const parsed = Number(result.rows[0]?.value);
    if (Number.isInteger(parsed) && parsed >= MIN_LISTING_PRICE_USD && parsed <= MAX_LISTING_PRICE_USD) {
      usd = parsed;
    }
  } catch (error) {
    // A missing settings table must not take checkout down with it.
    console.error("[directory listing price]", error);
  }
  return { usd, prices: await getCoursePrices({ price: usd, price_currency: "USD" }) };
}

/** "$5" / "₹440", for copy that quotes the fee. */
export function formatListingPrice(amount: number, currency: "INR" | "USD"): string {
  return currency === "INR"
    ? `₹${Math.round(amount).toLocaleString("en-IN")}`
    : `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}
