// Live INR <-> USD conversion for course pricing. The owner sets ONE price
// in one currency (courses.price + price_currency); the other currency is
// always derived here, at display time and at charge time, so nothing
// needs manual updating when the rate moves. Razorpay always charges INR,
// PayPal always charges USD.

let cachedRate: { inrPerUsd: number; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours -- pricing doesn't need to be live-live.
const FALLBACK_INR_PER_USD = 87.5; // used only if the FX API is unreachable.

async function getInrPerUsd(): Promise<number> {
  if (cachedRate && Date.now() - cachedRate.fetchedAt < CACHE_TTL_MS) {
    return cachedRate.inrPerUsd;
  }
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    const rate = data?.rates?.INR;
    if (typeof rate === "number" && rate > 0) {
      cachedRate = { inrPerUsd: rate, fetchedAt: Date.now() };
      return rate;
    }
  } catch {
    // fall through to cached/fallback rate below
  }
  return cachedRate?.inrPerUsd ?? FALLBACK_INR_PER_USD;
}

export type CoursePriceCurrency = "INR" | "USD";

export type CoursePrices = {
  /** What the owner typed, in the currency they chose. */
  base: { amount: number; currency: CoursePriceCurrency } | null;
  /** Whole rupees, charged by Razorpay. */
  inr: number | null;
  /** Whole dollars, charged by PayPal. */
  usd: number | null;
};

/** Pure conversion, exported for tests. Converted amounts round to whole
 * units and never drop below 1. */
export function convertCoursePrice(
  amount: number | null,
  currency: string | null,
  inrPerUsd: number,
): CoursePrices {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return { base: null, inr: null, usd: null };
  if (currency === "USD") {
    return { base: { amount, currency: "USD" }, inr: Math.max(1, Math.round(amount * inrPerUsd)), usd: amount };
  }
  return { base: { amount, currency: "INR" }, inr: amount, usd: Math.max(1, Math.round(amount / inrPerUsd)) };
}

export async function getCoursePrices(course: { price: number | null; price_currency: string | null }): Promise<CoursePrices> {
  if (course.price == null) return { base: null, inr: null, usd: null };
  return convertCoursePrice(course.price, course.price_currency, await getInrPerUsd());
}

export async function getInrPerUsdRate(): Promise<number> {
  return getInrPerUsd();
}

export function formatCoursePrice(amount: number, currency: CoursePriceCurrency): string {
  return currency === "INR" ? `₹${amount.toLocaleString("en-IN")}` : "$" + amount.toLocaleString("en-US");
}
