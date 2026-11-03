import test from "node:test";
import assert from "node:assert/strict";

const { parseSiteMetadata } = await import("../src/lib/siteMetadata.ts");

const at = (html, url = "https://example.com/") => parseSiteMetadata(html, new URL(url));

test("prefers og:site_name for the tool name over a sentence-shaped title", () => {
  const meta = at(`
    <html><head>
      <title>Acme: the fastest way to ship invoices</title>
      <meta property="og:site_name" content="Acme">
    </head></html>`);
  assert.equal(meta.name, "Acme");
});

test("falls back to the part of the title before a separator", () => {
  // The common shape when there is no og:site_name at all.
  assert.equal(at("<title>Acme | Invoicing for freelancers</title>").name, "Acme");
  assert.equal(at("<title>Acme - Invoicing</title>").name, "Acme");
  assert.equal(at("<title>Acme \u2014 Invoicing</title>").name, "Acme");
  assert.equal(at("<title>Acme \u2013 Invoicing</title>").name, "Acme");
  // A hyphenated single word is a name, not a separator, so it survives.
  assert.equal(at("<title>well-known-tool</title>").name, "well-known-tool");
});

test("takes the longer of the two descriptions as the body", () => {
  const meta = at(`
    <meta name="description" content="Short one.">
    <meta property="og:description" content="A noticeably longer description that says more about it.">`);
  assert.equal(meta.description, "A noticeably longer description that says more about it.");
  // The shorter one is still useful, as the one-line tagline.
  assert.equal(meta.tagline, "Short one.");
});

test("reads meta tags whatever order the attributes are in", () => {
  const meta = at(`<meta content="Reversed order works" property="og:description">`);
  assert.equal(meta.description, "Reversed order works");
});

test("decodes the entities that actually show up in titles", () => {
  assert.equal(at("<title>Ben &amp; Jerry&#39;s</title>").name, "Ben & Jerry's");
  assert.equal(at("<title>Caf&#xe9; tools</title>").name, "Café tools");
  assert.equal(at("<title>a&nbsp;b</title>").name, "a b");
});

test("collapses the whitespace of a title split across lines", () => {
  assert.equal(at("<title>\n  Acme\n  Tools\n</title>").name, "Acme Tools");
});

test("resolves a relative og:image against the final URL", () => {
  const meta = at(`<meta property="og:image" content="/cover.png">`, "https://example.com/tools/x");
  assert.equal(meta.image, "https://example.com/cover.png");
});

test("ignores an og:image that is not http or https", () => {
  assert.equal(at(`<meta property="og:image" content="data:image/png;base64,AAAA">`).image, null);
  assert.equal(at(`<meta property="og:image" content="javascript:alert(1)">`).image, null);
});

test("a junk og:image resolves relative rather than being rejected", () => {
  // Not a bug: anything without a scheme is a relative reference by the URL
  // spec, which is the same rule that makes "/cover.png" work. It can only
  // ever produce an https URL on the page's own host, and the fetcher that
  // consumes it still has to get a real image back from it.
  assert.equal(
    at(`<meta property="og:image" content=":::not a url">`).image,
    "https://example.com/:::not%20a%20url",
  );
});

test("falls back to twitter:image when there is no og:image", () => {
  const meta = at(`<meta name="twitter:image" content="https://cdn.example.com/a.png">`);
  assert.equal(meta.image, "https://cdn.example.com/a.png");
});

test("returns nulls rather than throwing on a page with no metadata", () => {
  const meta = at("<html><body><p>nothing here</p></body></html>");
  assert.equal(meta.name, null);
  assert.equal(meta.tagline, null);
  assert.equal(meta.description, null);
  assert.equal(meta.image, null);
  assert.equal(meta.url, "https://example.com/");
});

test("truncates long values to what the form fields accept", () => {
  const long = "x".repeat(900);
  const meta = at(`<title>${long}</title><meta name="description" content="${long}">`);
  assert.equal(meta.name.length, 80);
  assert.equal(meta.description.length, 600);
  // Truncated values end in an ellipsis so it is visibly cut, not just odd.
  assert.ok(meta.description.endsWith("…"));
});

test("keeps the redirected URL, so an http link is stored as its https target", () => {
  const meta = at("<title>Acme</title>", "https://www.acme.dev/home");
  assert.equal(meta.url, "https://www.acme.dev/home");
});

test("drops the tool name from the front of a tagline", () => {
  // Stripe ships exactly this shape: og:site_name "Stripe" and an og:title
  // repeating it before the real line.
  const meta = at(`
    <meta property="og:site_name" content="Stripe">
    <meta property="og:title" content="Stripe | Financial Infrastructure to Grow Your Revenue">`);
  assert.equal(meta.name, "Stripe");
  assert.equal(meta.tagline, "Financial Infrastructure to Grow Your Revenue");
});

test("leaves a tagline alone when it does not start with the name", () => {
  const meta = at(`
    <meta property="og:site_name" content="Acme">
    <meta property="og:title" content="Invoicing | for freelancers">`);
  assert.equal(meta.tagline, "Invoicing | for freelancers");
});

test("drops the tool name from the end of a tagline too", () => {
  // Notion ships this shape: the name trails the line instead of leading it.
  const meta = at(`
    <meta property="og:site_name" content="Notion">
    <meta property="og:title" content="The AI workspace that works for you. | Notion">`);
  assert.equal(meta.name, "Notion");
  assert.equal(meta.tagline, "The AI workspace that works for you.");
});
