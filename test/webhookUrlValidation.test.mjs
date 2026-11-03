import test from "node:test";
import assert from "node:assert/strict";
import { validateOutboundWebhookUrl } from "../src/lib/webhookUrlValidation.ts";

// Every case here uses a literal IP address so the check never touches real
// DNS -- keeps this test deterministic and network-independent, matching the
// rest of this suite's "no external services required" constraint.

test("rejects loopback destinations", async () => {
  const result = await validateOutboundWebhookUrl("http://127.0.0.1:9999/hook");
  assert.equal(result.ok, false);
});

test("rejects the IPv6 loopback address", async () => {
  const result = await validateOutboundWebhookUrl("http://[::1]:9999/hook");
  assert.equal(result.ok, false);
});

test("rejects RFC1918 private network destinations", async () => {
  for (const ip of ["http://10.0.0.5/hook", "http://192.168.1.1/hook", "http://172.16.0.1/hook"]) {
    const result = await validateOutboundWebhookUrl(ip);
    assert.equal(result.ok, false, `${ip} should be rejected`);
  }
});

test("rejects the cloud metadata service address", async () => {
  const result = await validateOutboundWebhookUrl("http://169.254.169.254/latest/meta-data/");
  assert.equal(result.ok, false);
});

test("rejects other link-local addresses", async () => {
  const result = await validateOutboundWebhookUrl("http://169.254.1.1/hook");
  assert.equal(result.ok, false);
});

test("accepts a genuinely public IP literal over http in a non-production environment", async () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  try {
    const result = await validateOutboundWebhookUrl("http://8.8.8.8/hook");
    assert.equal(result.ok, true);
    assert.equal(result.resolvedAddress, "8.8.8.8");
  } finally {
    process.env.NODE_ENV = original;
  }
});

test("requires https for a public destination when NODE_ENV is production", async () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const httpResult = await validateOutboundWebhookUrl("http://8.8.8.8/hook");
    assert.equal(httpResult.ok, false);
    const httpsResult = await validateOutboundWebhookUrl("https://8.8.8.8/hook");
    assert.equal(httpsResult.ok, true);
  } finally {
    process.env.NODE_ENV = original;
  }
});

test("rejects URLs with embedded credentials", async () => {
  const result = await validateOutboundWebhookUrl("http://user:pass@8.8.8.8/hook");
  assert.equal(result.ok, false);
});

test("rejects non-HTTP(S) schemes", async () => {
  const result = await validateOutboundWebhookUrl("file:///etc/passwd");
  assert.equal(result.ok, false);
});

test("rejects malformed URLs without throwing", async () => {
  const result = await validateOutboundWebhookUrl("not a url");
  assert.equal(result.ok, false);
});
