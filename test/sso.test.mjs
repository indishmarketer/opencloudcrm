import test from "node:test";
import assert from "node:assert/strict";
import { fetchSsoProfile, ssoCallbackUrl } from "../src/lib/sso.ts";
import { requestOrigin } from "../src/lib/requestOrigin.ts";

test("all SSO callbacks use the visitor's public origin", () => {
  for (const provider of ["google", "github", "linkedin"]) {
    assert.equal(ssoCallbackUrl(provider, "https://example.com"), `https://example.com/api/auth/oauth/${provider}/callback`);
  }
});

test("proxied sign-in uses the visitor's HTTPS domain", () => {
  const req = new Request("http://internal:3000/api/auth/oauth/google/start", {
    headers: { host: "example.com", "x-forwarded-proto": "https" },
  });
  assert.equal(ssoCallbackUrl("google", requestOrigin(req)), "https://example.com/api/auth/oauth/google/callback");
});

test("OIDC userinfo supplies a verified email and name for the contact", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({
    sub: "provider-123", email: "Person@Example.com", email_verified: true,
    given_name: "Ada", family_name: "Lovelace",
  });
  const profile = await fetchSsoProfile("linkedin", { accessToken: "token" });
  assert.deepEqual(profile, {
    providerUserId: "provider-123", email: "Person@Example.com",
    emailVerified: true, name: "Ada Lovelace",
  });
});

test("OIDC profile rejects an omitted email", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({ sub: "provider-123", name: "Ada" });
  assert.equal(await fetchSsoProfile("google", { accessToken: "token" }), null);
});
