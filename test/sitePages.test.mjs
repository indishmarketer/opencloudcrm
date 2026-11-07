import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  BLOCK_DEFS,
  BlockValidationError,
  applyMergeTags,
  createBlock,
  normalizeBlock,
  normalizeBlocks,
} from "../src/lib/pageBlocks.ts";
import {
  RESERVED_PATH_PREFIXES,
  hasUnpublishedChanges,
  normalizePagePath,
  validatePagePath,
} from "../src/lib/sitePagesShape.ts";
import { STARTER_PAGES, BUILT_IN_PAGES } from "../src/lib/defaultPages.ts";
import { PUBLIC_SITE_PAGES } from "../src/lib/publicSitePages.ts";
import { normalizeSiteChrome, safeHref } from "../src/lib/siteChromeShape.ts";
import {
  buildLegalLine,
  legacyBusinessProfileFromEnv,
  normalizeBusinessProfile,
  resolveBusiness,
  validateBusinessProfile,
  withArticle,
} from "../src/lib/businessProfileShape.ts";

const identity = (html) => html;

test("normalizePagePath produces clean lowercase addresses", () => {
  assert.equal(normalizePagePath("About Us!"), "/about-us");
  assert.equal(normalizePagePath("/Services/Web Design/"), "/services/web-design");
  assert.equal(normalizePagePath(""), "/");
  assert.equal(normalizePagePath("///"), "/");
});

test("validatePagePath rejects built-in app routes and bad shapes", () => {
  assert.equal(validatePagePath("/pricing"), null);
  assert.equal(validatePagePath("/services/web-design"), null);
  assert.match(validatePagePath("/blog/hello"), /built-in/);
  assert.match(validatePagePath("/console"), /built-in/);
  assert.match(validatePagePath("/webinars"), /built-in/);
  assert.equal(validatePagePath("/products"), null, "/products itself is a builder page");
  assert.match(validatePagePath("/a/b/c/d"), /three levels/);
});

test("every top-level app route is reserved or served by the page builder", () => {
  const appDir = path.resolve("src/app");
  const builderOwned = new Set(["[...slug]", "products", "resources"]);
  const ignored = new Set(["fonts", "layout.tsx", "page.tsx", "globals.css", "robots.ts", "sitemap.ts"]);
  for (const entry of fs.readdirSync(appDir)) {
    if (ignored.has(entry) || builderOwned.has(entry) || entry.startsWith("(")) continue;
    const route = `/${entry.replace(/\.(png|ico)$/, (m) => m)}`;
    assert.ok(
      RESERVED_PATH_PREFIXES.some((prefix) => route === prefix || route.startsWith(`${prefix}/`)),
      `${route} exists in src/app but is missing from RESERVED_PATH_PREFIXES`
    );
  }
});

test("every static public page.tsx is registered in PUBLIC_SITE_PAGES (search + sitemap)", () => {
  // Routes that are either private (account/console/auth), reached only via
  // a private link (token confirmation, unsubscribe), a pure redirect, or
  // dynamic/DB-driven content already wired into search/sitemap directly
  // (courses, blog posts, tools, webinars, prompts/skills/guides...) rather
  // than through this static catalogue.
  const EXCLUDED_PREFIXES = [
    "/account", "/console", "/login", "/forgot-password", "/reset-password", "/signup",
    "/verify", "/verify-email", "/unsubscribe", "/preview", "/book/manage", "/blog/preview",
    "/community/admin", "/community/messages", "/community/settings", "/community/pro",
    "/resources/prompt-skill-library/browse",
  ];
  const EXCLUDED_EXACT = new Set([
    "/", // the homepage is a page-builder row (listPublishedPageEntries), not a static entry
    "/community", // redirects straight to /community/general, which is registered
  ]);

  const registered = new Set(PUBLIC_SITE_PAGES.map((p) => p.url));

  function collectRoutes(dir, routes) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collectRoutes(full, routes);
      else if (entry.name === "page.tsx") routes.push(full);
    }
  }
  const files = [];
  collectRoutes(path.resolve("src/app"), files);

  const routes = files.map((f) => {
    const relative = f.split(path.sep).join("/").split("src/app")[1].replace("/page.tsx", "");
    return relative.replace(/\/\([^)]+\)/g, "") || "/"; // strip route groups like (protected)
  });

  for (const route of routes) {
    if (route.includes("[") || EXCLUDED_EXACT.has(route)) continue;
    if (EXCLUDED_PREFIXES.some((p) => route === p || route.startsWith(`${p}/`))) continue;
    assert.ok(
      registered.has(route),
      `${route} has a page.tsx but is missing from PUBLIC_SITE_PAGES in src/lib/publicSitePages.ts -- ` +
        `without an entry there it won't show up in the site's own search bar or the sitemap. ` +
        `Add it (set noindex: true if the page itself sets robots index:false), or add its prefix to ` +
        `EXCLUDED_PREFIXES above if it's genuinely private/dynamic/a redirect.`
    );
  }
});

test("normalizeBlock fills defaults, drops unknown props and cleans links/images", () => {
  const block = normalizeBlock(
    { type: "cta", props: { heading: "Hi", buttonHref: "javascript:alert(1)", secondaryHref: "/contact", evil: "x" } },
    identity
  );
  assert.equal(block.props.heading, "Hi");
  assert.equal(block.props.buttonHref, "");
  assert.equal(block.props.secondaryHref, "/contact");
  assert.equal(block.props.style, "band");
  assert.equal("evil" in block.props, false);
  const image = normalizeBlock({ type: "image", image: "data:image/png;base64,AAA" }, identity);
  assert.equal(image.props.image, "", "data: URLs are not allowed");
});

test("normalizeBlock accepts flat props and passes rich text through the sanitizer", () => {
  const block = normalizeBlock({ type: "richText", html: "<p>x</p>" }, (html) => `[clean]${html}`);
  assert.equal(block.props.html, "[clean]<p>x</p>");
});

test("normalizeBlocks enforces types, the built-in section rule and size limits", () => {
  assert.throws(() => normalizeBlocks([{ type: "nope" }], identity, { allowBuiltIn: false }), BlockValidationError);
  assert.throws(() => normalizeBlocks([{ type: "builtIn" }], identity, { allowBuiltIn: false }), BlockValidationError);
  assert.throws(() => normalizeBlocks([{ type: "builtIn" }, { type: "builtIn" }], identity, { allowBuiltIn: true }), BlockValidationError);
  assert.throws(() => normalizeBlocks(Array.from({ length: 61 }, () => ({ type: "spacer" })), identity, { allowBuiltIn: false }));
  const blocks = normalizeBlocks([{ id: "same", type: "spacer" }, { id: "same", type: "spacer" }], identity, { allowBuiltIn: false });
  assert.notEqual(blocks[0].id, blocks[1].id, "duplicate ids are replaced");
});

test("list fields are clamped to their maximum", () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ title: `Card ${i}` }));
  const block = normalizeBlock({ type: "cards", items }, identity);
  assert.equal(block.props.items.length, 12);
});

test("row blocks normalize nested column items and reject non-nestable children", () => {
  const row = normalizeBlock(
    {
      type: "row",
      props: {
        columns: "3",
        items: [
          [{ type: "heading", props: { text: "Col 1" } }],
          [],
          [{ type: "image", props: { image: "/ok.png" } }],
        ],
      },
    },
    identity
  );
  assert.equal(row.props.items.length, 3, "padded/truncated to match columns");
  assert.equal(row.props.items[0][0].type, "heading");
  assert.equal(row.props.items[0][0].props.text, "Col 1");
  assert.equal(row.props.items[2][0].props.image, "/ok.png");

  assert.throws(() => normalizeBlock({ type: "cards" }, identity, { nestableOnly: true }), BlockValidationError);
  assert.throws(
    () => normalizeBlock({ type: "row", props: { items: [[{ type: "cards" }]] } }, identity),
    BlockValidationError,
    "a composite section (not marked nestable) can't go inside a row's column"
  );
  assert.throws(() => normalizeBlock({ type: "row", props: { items: [[{ type: "row" }]] } }, identity), BlockValidationError, "rows can't nest inside rows");
});

test("row columns are capped at MAX_ROW_ITEMS_PER_COLUMN and defaults to 2 columns", () => {
  const many = Array.from({ length: 20 }, () => ({ type: "spacer" }));
  const row = normalizeBlock({ type: "row", props: { items: [many, []] } }, identity);
  assert.equal(row.props.items[0].length, 10);
  assert.equal(row.props.items.length, 2);
});

test("color fields only accept hex colors", () => {
  const ok = normalizeBlock({ type: "heading", props: { backgroundColor: "#1a1a1a" } }, identity);
  assert.equal(ok.props.backgroundColor, "#1a1a1a");
  const bad = normalizeBlock({ type: "heading", props: { backgroundColor: "red; } </style>" } }, identity);
  assert.equal(bad.props.backgroundColor, "");
});

test("code fields pass through unsanitized (a deliberate escape hatch, unlike richtext)", () => {
  const block = normalizeBlock({ type: "customCode", props: { html: "<script>alert(1)</script>" } }, (html) => `[sanitized]${html}`);
  assert.equal(block.props.html, "<script>alert(1)</script>", "code fields must not go through the richtext sanitizer");
});

test("datetime fields only accept parseable dates, stored as given (UTC conversion happens client-side)", () => {
  const ok = normalizeBlock({ type: "countdown", props: { target: "2027-01-01T00:00:00.000Z" } }, identity);
  assert.equal(ok.props.target, "2027-01-01T00:00:00.000Z");
  const bad = normalizeBlock({ type: "countdown", props: { target: "not a date" } }, identity);
  assert.equal(bad.props.target, "");
});

test("featuredOn and socialIcons are now list-field driven, not hardcoded", () => {
  const featured = createBlock("featuredOn");
  assert.deepEqual(featured.props.items, []);
  const social = normalizeBlock(
    { type: "socialIcons", props: { items: [{ platform: "x", href: "https://x.com/example" }] } },
    identity
  );
  assert.equal(social.props.items[0].platform, "x");
  assert.equal(social.props.items[0].href, "https://x.com/example");
});

test("every block type's defaults survive normalization unchanged", () => {
  for (const def of BLOCK_DEFS) {
    const created = createBlock(def.type);
    const normalized = normalizeBlock(created, identity);
    assert.deepEqual(normalized.props, created.props, `${def.type} defaults don't match its own field rules`);
  }
});

test("starter and built-in default pages are valid and neutral", () => {
  for (const page of [...STARTER_PAGES, ...BUILT_IN_PAGES]) {
    normalizeBlocks(page.blocks, identity, { allowBuiltIn: BUILT_IN_PAGES.includes(page) });
    const text = JSON.stringify(page).toLowerCase();
    for (const banned of ["indish", "shubho", "shillong", "udyam", "meghalaya"]) {
      assert.equal(text.includes(banned), false, `${page.path} default content mentions "${banned}"`);
    }
  }
});

test("applyMergeTags fills known tags and leaves unknown ones alone", () => {
  assert.equal(applyMergeTags("Welcome to {{site_name}} {{ year }}", { site_name: "Acme", year: "2027" }), "Welcome to Acme 2027");
  assert.equal(applyMergeTags("{{unknown}}", {}), "{{unknown}}");
});

test("hasUnpublishedChanges ignores key order (Postgres jsonb reorders keys)", () => {
  const snapshot = { title: "T", metaTitle: "", metaDescription: "", ogImage: "", noindex: false, blocks: [{ id: "a", type: "spacer", props: { size: "md", divider: false } }] };
  const reordered = { blocks: [{ props: { divider: false, size: "md" }, type: "spacer", id: "a" }], noindex: false, ogImage: "", metaDescription: "", metaTitle: "", title: "T" };
  assert.equal(hasUnpublishedChanges({ ...snapshot, published: reordered }), false);
  assert.equal(hasUnpublishedChanges({ ...snapshot, title: "Changed", published: reordered }), true);
  assert.equal(hasUnpublishedChanges({ ...snapshot, published: null }), true);
});

test("safeHref and normalizeSiteChrome only keep safe links", () => {
  assert.equal(safeHref("/about"), "/about");
  assert.equal(safeHref("//evil.com"), "");
  assert.equal(safeHref("javascript:alert(1)"), "");
  assert.equal(safeHref("mailto:a@b.co"), "mailto:a@b.co");
  const chrome = normalizeSiteChrome({
    header: { items: [{ type: "dropdown", label: "More", links: [{ label: "Ok", href: "/ok" }, { label: "Bad", href: "javascript:x" }] }, { type: "weird", label: "x" }], ctaLabel: "Go", ctaHref: "/go" },
    footer: { tagline: "t", columns: [{ title: "", links: [] }] },
    socials: { x: "https://x.com/a", facebook: "javascript:x", myspace: "https://myspace.com" },
  });
  assert.equal(chrome.header.items.length, 1);
  assert.equal(chrome.header.items[0].links.length, 1);
  assert.equal(chrome.footer.columns.length, 0, "untitled columns are dropped");
  assert.deepEqual(chrome.socials, { x: "https://x.com/a" });
});

test("business profile: blank fields stay hidden and the legal line reads naturally", () => {
  const empty = resolveBusiness(normalizeBusinessProfile({}), "Acme");
  assert.equal(empty.brand, "Acme");
  assert.equal(empty.legalLine, "");
  assert.equal(empty.addressOneLine, "");
  assert.deepEqual(empty.emails, []);
  assert.equal(empty.phoneHref, "");

  const us = normalizeBusinessProfile({ ownerName: "Jane", entityType: "LLC", registrationLabel: "EIN", registrationNumber: "12-3", address: { countryCode: "us" } });
  assert.equal(buildLegalLine(us, "Acme"), "Acme is an LLC owned by Jane (EIN: 12-3).");
  assert.equal(us.address.countryCode, "US");
  assert.equal(withArticle("sole proprietorship"), "a sole proprietorship");
  assert.equal(withArticle("online store"), "an online store");
  assert.equal(withArticle("GmbH"), "a GmbH");
  assert.equal(buildLegalLine({ ...us, legalLineOverride: "Custom." }, "Acme"), "Custom.");
});

test("business profile validation", () => {
  assert.match(validateBusinessProfile(normalizeBusinessProfile({ email: "nope" })), /email/);
  assert.match(validateBusinessProfile(normalizeBusinessProfile({ registrationNumber: "1" })), /label/);
  assert.match(validateBusinessProfile(normalizeBusinessProfile({ policies: { refundWindowDays: "ten" } })), /refund window/);
  assert.equal(validateBusinessProfile(normalizeBusinessProfile({ email: "a@b.co" })), null);
});

test("legacy BUSINESS_* env vars still load until the profile is saved", () => {
  assert.equal(legacyBusinessProfileFromEnv({}), null);
  const legacy = legacyBusinessProfileFromEnv({ BUSINESS_PROPRIETOR: "Owner", BUSINESS_UDYAM_NUMBER: "U-1", LEGAL_MIN_AGE: "16" });
  assert.equal(legacy.ownerName, "Owner");
  assert.equal(legacy.registrationLabel, "Udyam Registration");
  assert.equal(legacy.policies.minAge, "16");
});
