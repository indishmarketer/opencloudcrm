import test from "node:test";
import assert from "node:assert/strict";
import { PUBLIC_SITE_PAGES, rankSearchResults, searchPublicSitePages } from "../src/lib/publicSitePages.ts";

test("public site search includes webinars and legal pages but no private routes", () => {
  assert.deepEqual(searchPublicSitePages("webinar").map((result) => result.url), ["/webinars"]);
  assert.deepEqual(searchPublicSitePages("privacy policy").map((result) => result.url), ["/privacy-policy"]);
  assert.equal(PUBLIC_SITE_PAGES.some((page) => page.url.startsWith("/console") || page.url.startsWith("/account")), false);
});

test("search ranks an exact title first and removes duplicate URLs", () => {
  const results = rankSearchResults([
    { type: "page", title: "Webinars", desc: "Watch scheduled sessions.", url: "/webinars" },
    { type: "blog", title: "Webinar planning guide", desc: "Plan an event.", url: "/blog/webinar-planning" },
    { type: "page", title: "Duplicate", desc: "A duplicate route.", url: "/webinars" },
  ], "webinar");

  assert.equal(results[0].url, "/webinars");
  assert.equal(results.length, 2);
});
