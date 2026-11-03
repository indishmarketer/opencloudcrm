import crypto from "node:crypto";
import { getSessionSecret } from "@/lib/sessionSecret";
import type { CoursePrices } from "@/lib/currency";

/** A short-lived, server-signed snapshot of a course's prices, made when
 * the page renders and handed back at checkout. The checkout charges the
 * quoted INR/USD figure, so the amount on the button is the amount charged
 * even if the exchange rate refreshes in between. Only honoured while the
 * owner's base price is unchanged. */

const QUOTE_TTL_SECONDS = 60 * 60;

export type PriceQuote = {
  courseId: number;
  base: number;
  baseCurrency: "INR" | "USD";
  inr: number;
  usd: number;
};

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(`price-quote:${payload}`).digest("base64url");
}

export function createPriceQuote(courseId: number, prices: CoursePrices): string | null {
  if (!prices.base || prices.inr == null || prices.usd == null) return null;
  const payload = Buffer.from(JSON.stringify({
    c: courseId,
    b: prices.base.amount,
    bc: prices.base.currency,
    i: prices.inr,
    u: prices.usd,
    e: Math.floor(Date.now() / 1000) + QUOTE_TTL_SECONDS,
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyPriceQuote(token: unknown): PriceQuote | null {
  if (typeof token !== "string" || token.length > 1000) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof d.e !== "number" || d.e < Math.floor(Date.now() / 1000)) return null;
    if (![d.c, d.b, d.i, d.u].every((n) => Number.isInteger(n) && (n as number) > 0)) return null;
    if (d.bc !== "INR" && d.bc !== "USD") return null;
    return { courseId: d.c as number, base: d.b as number, baseCurrency: d.bc, inr: d.i as number, usd: d.u as number };
  } catch {
    return null;
  }
}

/** The amount to charge: the quote when it is valid for this course and the
 * base price hasn't changed since, otherwise the fresh live figure. */
export function chargeAmount(
  currency: "INR" | "USD",
  courseId: number,
  fresh: CoursePrices,
  quoteToken: unknown,
): number | null {
  const quote = verifyPriceQuote(quoteToken);
  if (
    quote &&
    quote.courseId === courseId &&
    fresh.base &&
    quote.base === fresh.base.amount &&
    quote.baseCurrency === fresh.base.currency
  ) {
    return currency === "INR" ? quote.inr : quote.usd;
  }
  return currency === "INR" ? fresh.inr : fresh.usd;
}
