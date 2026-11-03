const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
const API_SECRET = process.env.GA4_API_SECRET;

const SESSION_COOKIE = MEASUREMENT_ID ? `_ga_${MEASUREMENT_ID.slice(2)}` : null;
export const GA4_COOKIE_NAMES = SESSION_COOKIE ? ["_ga", SESSION_COOKIE] : ["_ga"];

/** "GA1.1.123456789.1700000000" -> "123456789.1700000000" */
export function gaClientIdFrom(cookie: string | null | undefined): string | null {
  const parts = cookie?.split(".") ?? [];
  return parts.length >= 4 ? `${parts[parts.length - 2]}.${parts[parts.length - 1]}` : null;
}

/** Session id from the _ga_<id> cookie, in either the old
 * "GS1.1.1700000000.3..." or the newer "GS2.1.s1700000000$o3..." format. */
export function gaSessionIdFrom(cookie: string | null | undefined): string | null {
  if (!cookie) return null;
  const gs2 = cookie.match(/^GS2\.\d+\.s(\d+)/);
  if (gs2) return gs2[1];
  const gs1 = cookie.match(/^GS1\.\d+\.(\d+)\./);
  return gs1 ? gs1[1] : null;
}

export function gaCookiesFrom(cookies: { get(name: string): { value: string } | undefined }) {
  return {
    gaClientId: gaClientIdFrom(cookies.get("_ga")?.value),
    gaSessionId: SESSION_COOKIE ? gaSessionIdFrom(cookies.get(SESSION_COOKIE)?.value) : null,
  };
}

/** Sends the purchase to GA4 from the server (Measurement Protocol), so a
 * sale still counts when an ad blocker stopped the browser tag. The "You're
 * in" page sends the same transaction_id, and GA4 keeps one of the two.
 * Best effort, never throws; no-ops until GA4_API_SECRET is set. */
export async function sendGa4Purchase(params: {
  clientId?: string | null;
  sessionId?: string | null;
  userId?: string | number | null;
  transactionId: string;
  value: number;
  currency: string;
  itemId: string;
  itemName: string;
}): Promise<void> {
  if (!API_SECRET || !MEASUREMENT_ID) return;
  const clientId = params.clientId || `${Math.floor(Math.random() * 2_147_483_647)}.${Math.floor(Date.now() / 1000)}`;
  const payload = {
    client_id: clientId,
    ...(params.userId != null ? { user_id: String(params.userId) } : {}),
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: params.transactionId,
          value: params.value,
          currency: params.currency,
          items: [{ item_id: params.itemId, item_name: params.itemName, price: params.value, quantity: 1 }],
          ...(params.sessionId ? { session_id: params.sessionId } : {}),
          engagement_time_msec: 1,
        },
      },
    ],
  };
  try {
    await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${encodeURIComponent(API_SECRET)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    );
  } catch {
    // best-effort only, never let analytics delivery block a real user flow
  }
}
