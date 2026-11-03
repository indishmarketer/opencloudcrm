import test from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET ||= "test-session-secret-for-price-quotes-0123456789";

const { createPriceQuote, verifyPriceQuote, chargeAmount } = await import("../src/lib/priceQuote.ts");
const { classifyEmailClick } = await import("../src/lib/emailClickFilter.ts");

const prices = { base: { amount: 1499, currency: "INR" }, inr: 1499, usd: 16 };

test("a price quote charges exactly what the buyer saw, even after the rate moves", () => {
  const quote = createPriceQuote(7, prices);
  assert.ok(quote);
  const laterRate = { base: { amount: 1499, currency: "INR" }, inr: 1499, usd: 17 };
  assert.equal(chargeAmount("USD", 7, laterRate, quote), 16);
  assert.equal(chargeAmount("INR", 7, laterRate, quote), 1499);
});

test("a price quote is ignored for another course, a changed price, or tampering", () => {
  const quote = createPriceQuote(7, prices);
  const fresh = { base: { amount: 1499, currency: "INR" }, inr: 1499, usd: 17 };
  assert.equal(chargeAmount("USD", 8, fresh, quote), 17);
  const repriced = { base: { amount: 999, currency: "INR" }, inr: 999, usd: 11 };
  assert.equal(chargeAmount("USD", 7, repriced, quote), 11);
  const [payload, sig] = quote.split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), u: 1 })).toString("base64url");
  assert.equal(verifyPriceQuote(`${forged}.${sig}`), null);
  assert.equal(chargeAmount("USD", 7, fresh, undefined), 17);
});

test("free courses produce no quote", () => {
  assert.equal(createPriceQuote(7, { base: null, inr: null, usd: null }), null);
});

const now = new Date("2026-10-02T12:00:00Z");
const browser = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

test("a normal person's click counts", () => {
  assert.deepEqual(
    classifyEmailClick({ method: "GET", userAgent: browser, sentAt: new Date(now.getTime() - 3600_000), now, otherLinkClickedWithinBurst: false }),
    { human: true },
  );
});

test("scanner clicks are filtered out", () => {
  const base = { method: "GET", userAgent: browser, sentAt: new Date(now.getTime() - 3600_000), now, otherLinkClickedWithinBurst: false };
  assert.equal(classifyEmailClick({ ...base, method: "HEAD" }).human, false);
  assert.equal(classifyEmailClick({ ...base, userAgent: "" }).human, false);
  assert.equal(classifyEmailClick({ ...base, userAgent: "Mozilla/5.0 (compatible; Barracuda Sentinel)" }).human, false);
  assert.equal(classifyEmailClick({ ...base, userAgent: "python-requests/2.31" }).human, false);
  assert.equal(classifyEmailClick({ ...base, sentAt: new Date(now.getTime() - 4000) }).human, false);
  assert.equal(classifyEmailClick({ ...base, otherLinkClickedWithinBurst: true }).human, false);
});
