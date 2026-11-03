import { headers } from "next/headers";
import { pool } from "@/lib/db";
import { normalizeCountry, pickCheckoutMethod } from "@/lib/countries";
import { getRazorpayKeyId } from "@/lib/razorpay";
import { getPaypalClientId } from "@/lib/paypal";
import type { CoursePrices } from "@/lib/currency";

/** Cloudflare's guess at the visitor's country from their IP. A VPN moves
 * it, so it is only the fallback when the account has no country. */
export async function ipCountry(): Promise<string | null> {
  return normalizeCountry((await headers()).get("cf-ipcountry"));
}

export async function accountCountry(userId: number): Promise<string | null> {
  const result = await pool.query<{ country: string | null }>(
    "SELECT country FROM contacts WHERE user_id = $1 ORDER BY updated_at DESC, id DESC LIMIT 1",
    [userId],
  );
  return result.rows[0]?.country ?? null;
}

/** The phone number on file for this account (from signup, account
 * settings, a call booking, or a gateway's own checkout), if any -- used to
 * prefill Razorpay/PayPal checkout so a returning buyer isn't asked again. */
export async function accountPhone(userId: number): Promise<string | null> {
  const result = await pool.query<{ phone: string | null }>(
    "SELECT phone FROM contacts WHERE user_id = $1 ORDER BY updated_at DESC, id DESC LIMIT 1",
    [userId],
  );
  return result.rows[0]?.phone ?? null;
}

export type CheckoutRegion = {
  /** The country checkout is decided by, null when unknown. */
  country: string | null;
  /** Where that came from, so the page can offer "not right? change it". */
  countryFrom: "account" | "ip" | "unknown";
  /** The one payment method this buyer is offered. */
  method: "razorpay" | "paypal" | null;
  currency: "INR" | "USD";
  paypalClientId: string | null;
};

/** One payment method per buyer: India pays in INR through Razorpay (PayPal
 * refuses India-billing buyers paying an India-registered merchant);
 * everyone else pays in USD through PayPal's card form or PayPal. The
 * account's saved country wins over the IP guess, so a VPN doesn't flip
 * the method. Unknown location is treated as India, the default market. */
export async function getCheckoutRegion(userId: number | null): Promise<CheckoutRegion> {
  const saved = userId ? await accountCountry(userId) : null;
  const guessed = saved ? null : await ipCountry();
  const country = saved ?? guessed;
  const countryFrom = saved ? "account" : guessed ? "ip" : "unknown";
  const razorpay = getRazorpayKeyId() !== null;
  const paypalClientId = getPaypalClientId();

  const method = pickCheckoutMethod(country, razorpay, paypalClientId !== null);
  return {
    country,
    countryFrom,
    method,
    currency: method === "paypal" ? "USD" : "INR",
    paypalClientId: method === "paypal" ? paypalClientId : null,
  };
}

/** What the checkout popup needs: the buyer's one method and the price in
 * its currency. */
export type CheckoutOffer = {
  method: CheckoutRegion["method"];
  amount: number | null;
  currency: "INR" | "USD";
  paypalClientId: string | null;
  country: string | null;
};

export function checkoutOffer(region: CheckoutRegion, prices: CoursePrices): CheckoutOffer {
  return {
    method: region.method,
    amount: region.currency === "USD" ? prices.usd : prices.inr,
    currency: region.currency,
    paypalClientId: region.paypalClientId,
    country: region.country,
  };
}
