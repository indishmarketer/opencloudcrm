import test from "node:test";
import assert from "node:assert/strict";

// getCoursePrices fetches the live rate once and caches it, so the second
// call below must reuse the cached rate even when the network is down.
test("getCoursePrices converts at the live rate and keeps the cached rate on failure", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ rates: { INR: 80 } }) });

  const { getCoursePrices } = await import("../src/lib/currency.ts");

  assert.deepEqual(await getCoursePrices({ price: 800, price_currency: "INR" }), {
    base: { amount: 800, currency: "INR" },
    inr: 800,
    usd: 10,
  });
  assert.deepEqual(await getCoursePrices({ price: 9, price_currency: "USD" }), {
    base: { amount: 9, currency: "USD" },
    inr: 720,
    usd: 9,
  });
  assert.deepEqual(await getCoursePrices({ price: null, price_currency: "INR" }), {
    base: null,
    inr: null,
    usd: null,
  });

  global.fetch = async () => {
    throw new Error("network down");
  };
  assert.equal((await getCoursePrices({ price: 800, price_currency: "INR" })).usd, 10);

  global.fetch = originalFetch;
});
