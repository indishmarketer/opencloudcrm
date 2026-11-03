import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { verifyMuxWebhookSignature, buildMuxSignatureHeader, getSignedMuxThumbnailUrl, muxWebhookIdentifiers, signMuxPlaybackToken } from "../src/lib/mux.ts";

test("Mux playback signing accepts its base64 PKCS#1 key with escaped line breaks", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString().replace(/\n/g, "\\n");
  const previousId = process.env.MUX_SIGNING_KEY_ID;
  const previousKey = process.env.MUX_SIGNING_KEY_PRIVATE;
  process.env.MUX_SIGNING_KEY_ID = "test-signing-key";
  process.env.MUX_SIGNING_KEY_PRIVATE = Buffer.from(pem).toString("base64");
  try {
    const token = await signMuxPlaybackToken("signed-playback-id");
    assert.match(token || "", /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  } finally {
    if (previousId === undefined) delete process.env.MUX_SIGNING_KEY_ID;
    else process.env.MUX_SIGNING_KEY_ID = previousId;
    if (previousKey === undefined) delete process.env.MUX_SIGNING_KEY_PRIVATE;
    else process.env.MUX_SIGNING_KEY_PRIVATE = previousKey;
  }
});

test("Mux thumbnail URLs preserve signed image parameters", async () => {
  const url = await getSignedMuxThumbnailUrl("public-playback-id", { time: 1, width: 1280 });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("time"), "1");
  assert.equal(parsed.searchParams.get("width"), "1280");
});

test("Mux webhook signature verification accepts a valid signature", () => {
  const secret = "whsec_test_123";
  const payload = JSON.stringify({ type: "video.asset.ready", data: { id: "abc" } });
  const header = buildMuxSignatureHeader(payload, secret);
  assert.equal(verifyMuxWebhookSignature(payload, header, secret), true);
});

test("Mux webhook verification rejects tampered payload", () => {
  const secret = "whsec_test_123";
  const payload = JSON.stringify({ type: "video.asset.ready", data: { id: "abc" } });
  const header = buildMuxSignatureHeader(payload, secret);
  assert.equal(verifyMuxWebhookSignature(payload + "x", header, secret), false);
});

test("Mux webhook verification rejects wrong secret", () => {
  const secret = "whsec_test_123";
  const payload = '{"hello":"world"}';
  const header = buildMuxSignatureHeader(payload, secret);
  assert.equal(verifyMuxWebhookSignature(payload, header, "wrong-secret"), false);
});

test("Mux webhook verification rejects expired timestamp", () => {
  const secret = "whsec_test_123";
  const payload = '{"a":1}';
  const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 min ago, beyond 5 min tolerance
  const header = buildMuxSignatureHeader(payload, secret, oldTimestamp);
  assert.equal(verifyMuxWebhookSignature(payload, header, secret), false);
});

test("Mux webhook verification rejects malformed header", () => {
  assert.equal(verifyMuxWebhookSignature("{}", "not-a-valid-header", "secret"), false);
  assert.equal(verifyMuxWebhookSignature("{}", null, "secret"), false);
  assert.equal(verifyMuxWebhookSignature("{}", "t=123,v1=abc", ""), false);
});

test("Mux webhook verification supports multiple v1 signatures (first valid wins)", () => {
  const secret = "whsec_test_123";
  const payload = '{"a":1}';
  const good = buildMuxSignatureHeader(payload, secret);
  // Build a header with two v1 entries, one bad one good
  const parts = good.split(",");
  const headerWithTwo = `${parts[0]},v1=0000000000000000000000000000000000000000000000000000000000000000,${parts[1]}`;
  assert.equal(verifyMuxWebhookSignature(payload, headerWithTwo, secret), true);
});

test("buildMuxSignatureHeader is deterministic and hex matches", () => {
  const secret = "s";
  const payload = "{}";
  const ts = 1700000000;
  const a = buildMuxSignatureHeader(payload, secret, ts);
  const b = buildMuxSignatureHeader(payload, secret, ts);
  assert.equal(a, b);
  assert.match(a, /^t=\d+,v1=[0-9a-f]{64}$/);
  assert.equal(a.split(",")[0], "t=1700000000");
});

test("upload webhook IDs distinguish the upload object from its asset", () => {
  assert.deepEqual(muxWebhookIdentifiers("video.upload.asset_created", {
    id: "upload-123",
    asset_id: "asset-456",
    passthrough: "webinar:7:correlation",
  }), { uploadId: "upload-123", assetId: "asset-456", passthrough: "webinar:7:correlation" });
});

test("asset webhook IDs use the asset ID and originating upload ID", () => {
  assert.deepEqual(muxWebhookIdentifiers("video.asset.ready", {
    id: "asset-456",
    upload_id: "upload-123",
    passthrough: "webinar:7:correlation",
  }), { uploadId: "upload-123", assetId: "asset-456", passthrough: "webinar:7:correlation" });
});
