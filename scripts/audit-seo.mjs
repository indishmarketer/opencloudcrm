import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import pg from "pg";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const checkUrls = argv.includes("--check-urls");
const strict = argv.includes("--strict");
const reportOption = argv.find((arg) => arg.startsWith("--report="));
const reportPath = reportOption ? path.resolve(root, reportOption.slice(9)) : null;
const currentYear = new Date().getUTCFullYear();

// Use the same database configuration as `npm run migrate`. Nothing in this
// public command depends on a particular host, container name, or SSH key.
function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const filename of [".env.local", ".env"]) {
    const filePath = path.join(root, filename);
    if (!fs.existsSync(filePath)) continue;
    const line = fs.readFileSync(filePath, "utf8").split(/\r?\n/).find((value) => /^DATABASE_URL=/.test(value.trim()));
    if (line) return line.trim().slice("DATABASE_URL=".length).replace(/^(["'])(.*)\1$/, "$2");
  }
  throw new Error("DATABASE_URL is required for the SEO audit. Set it in the environment, .env.local, or .env.");
}

async function fetchBlogPosts() {
  const sql = `
    SELECT COALESCE(json_agg(json_build_object(
      'id', id, 'slug', slug, 'title', title, 'html', html, 'excerpt', excerpt,
      'feature_image', feature_image, 'og_image', og_image, 'meta_title', meta_title,
      'meta_description', meta_description, 'category', category, 'author_slug', author_slug,
      'status', status, 'published_at', published_at
    )), '[]'::json) AS posts FROM blog_posts;
  `;
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const result = await client.query(sql);
    return result.rows[0]?.posts || [];
  } finally {
    await client.end();
  }
}

const posts = await fetchBlogPosts();
const categories = require(path.join(root, "src/data/blog-categories.json"));
const { blogSourceReviews } = require(path.join(root, "src/data/blog-sources.ts"));
const errors = [], warnings = [], info = [];
const add = (list, code, message, slug) => list.push({ code, message, ...(slug ? { slug } : {}) });

function duplicates(items, field) {
  const values = new Map();
  for (const item of items) {
    const raw = item[field];
    const value = raw == null || String(raw).trim().toUpperCase() === "NULL" ? "" : String(raw).trim().toLowerCase();
    if (value) values.set(value, [...(values.get(value) || []), item.slug]);
  }
  return [...values.entries()].filter(([, slugs]) => slugs.length > 1);
}
function textOf(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z0-9#]+;/gi, " ").replace(/\s+/g, " ").trim();
}
function linksOf(html) {
  return [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
}

const postsBySlug = new Map(posts.map((post) => [post.slug, post]));
const categorySlugs = new Set(categories.map((category) => category.slug));

for (const [, slugs] of duplicates(posts, "slug")) add(errors, "duplicate-slug", `Duplicate slugs: ${slugs.join(", ")}`);
for (const [title, slugs] of duplicates(posts, "title")) add(warnings, "duplicate-title", `Repeated title '${title}': ${slugs.join(", ")}`);
for (const [, slugs] of duplicates(posts, "meta_title")) add(warnings, "duplicate-meta-title", `Repeated meta title: ${slugs.join(", ")}`);
for (const [, slugs] of duplicates(posts, "meta_description")) add(warnings, "duplicate-meta-description", `Repeated meta description: ${slugs.join(", ")}`);

for (const post of posts) {
  if (!post.slug || !post.title) add(errors, "missing-field", "Missing slug or title", post.slug);
  // published_at is legitimately null pre-publish; only a published post must have one.
  if (post.status === "published" && !post.published_at) add(errors, "missing-field", "Published post has no published_at", post.slug);
  if (!post.excerpt || post.excerpt.trim().toUpperCase() === "NULL") add(errors, "missing-excerpt", "Excerpt is empty or NULL", post.slug);
  if (!categorySlugs.has(post.category)) add(errors, "invalid-category", `Unknown category '${post.category}'`, post.slug);
  for (const field of ["html", "meta_description"]) {
    const value = post[field];
    if (!value || String(value).trim().toUpperCase() === "NULL") add(errors, "missing-field", `Missing or NULL ${field}`, post.slug);
  }
}

const claimHeavy = /\b(review|reviews|best|scam|legit|vs\.?|worth|pricing|make money|monetize|income|earn|free)\b/i;
const staticRoutes = new Set(["/", "/about", "/apply-to-write", "/blog", "/blog/category", "/community", "/community/general", "/community/leaderboard", "/community/members", "/contact", "/courses", "/privacy", "/products", "/reviews", "/services", "/terms", "/tools"]);

for (const post of posts) {
  const wordCount = textOf(post.html || "").split(/\s+/).filter(Boolean).length;
  if (wordCount < 800) add(warnings, "thin-article", `Only ${wordCount} words; manually confirm query coverage`, post.slug);
  const years = [...post.title.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  const newestYear = years.length ? Math.max(...years) : null;
  if (newestYear && newestYear < currentYear) add(warnings, "stale-edition", `Newest title year is ${newestYear}; retest before renaming to ${currentYear}`, post.slug);
  if (claimHeavy.test(post.title) && !blogSourceReviews[post.slug]) add(warnings, "sources-needed", "Claim-heavy article needs maintained primary sources and first-hand evidence", post.slug);

  for (const href of linksOf(post.html || "")) {
    if (/^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    let url;
    try { url = new URL(href.replaceAll("__GHOST_URL__", "https://www.indishmarketer.com"), "https://www.indishmarketer.com"); }
    catch { add(errors, "invalid-link", `Invalid href '${href}'`, post.slug); continue; }
    if (!/^(www\.)?indishmarketer\.com$/i.test(url.hostname)) continue;
    const pathname = url.pathname.replace(/\/$/, "") || "/";
    if (pathname.startsWith("/blog/category/")) {
      if (!categorySlugs.has(pathname.slice(15))) add(errors, "broken-category-link", `Unknown category link '${pathname}'`, post.slug);
    } else if (pathname.startsWith("/blog/")) {
      if (!postsBySlug.has(pathname.slice(6))) add(errors, "broken-blog-link", `Unknown article link '${pathname}'`, post.slug);
    } else if (staticRoutes.has(pathname) || /^\/(courses|tools|community|author|reviews)\//.test(pathname)) {
      continue;
    } else if (postsBySlug.has(pathname.slice(1))) {
      add(warnings, "legacy-internal-link", `Still uses legacy article path '${pathname}'`, post.slug);
    }
  }
}

for (const [slug, review] of Object.entries(blogSourceReviews)) {
  if (!postsBySlug.has(slug)) add(errors, "orphan-source-review", "Registry points to missing article", slug);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(review.reviewedAt) || Number.isNaN(Date.parse(review.reviewedAt + "T00:00:00Z"))) add(errors, "invalid-review-date", `Invalid reviewedAt '${review.reviewedAt}'`, slug);
  if (review.reviewedAt > new Date().toISOString().slice(0, 10)) add(errors, "future-review-date", `Future reviewedAt '${review.reviewedAt}'`, slug);
  if (!Array.isArray(review.sources) || !review.sources.length) add(errors, "missing-sources", "Source review has no sources", slug);
  const seen = new Set();
  for (const source of review.sources || []) {
    if (!source.label?.trim()) add(errors, "missing-source-label", "Source label is empty", slug);
    try { if (new URL(source.url).protocol !== "https:") add(errors, "insecure-source", source.url, slug); }
    catch { add(errors, "invalid-source-url", source.url, slug); }
    if (seen.has(source.url)) add(warnings, "duplicate-source", source.url, slug);
    seen.add(source.url);
  }
}

const codeChecks = [
  ["src/app/blog/[slug]/page.tsx", "alternates: { canonical:", "article-canonical"],
  ["src/components/BlogPostArticle.tsx", "citation:", "article-citations"],
  ["src/app/blog/page.tsx", '"@type": "Blog"', "blog-schema"],
  ["src/app/blog/category/page.tsx", '"@type": "CollectionPage"', "category-schema"],
  ["src/app/sitemap.ts", "await getPublicPosts()", "sitemap-post-source"],
  ["next.config.ts", "...blogSlugs.map", "legacy-post-redirects"],
  ["src/app/book/[slug]/page.tsx", "alternates: { canonical:", "booking-canonical"],
  ["src/app/book/[slug]/page.tsx", "robots: { index: false, follow: false }", "booking-success-noindex"],
  ["src/app/book/[slug]/page.tsx", "images: [HOST_AVATAR_URL]", "booking-og-image"],
  ["src/app/book/[slug]/page.tsx", '"@type": "Service"', "booking-schema"],
  ["src/app/book/[slug]/page.tsx", "aggregateRating", "booking-rating-schema"],
  ["src/app/book/manage/[token]/page.tsx", "robots: { index: false, follow: false }", "booking-manage-noindex"],
  ["src/app/webinars/[slug]/page.tsx", "alternates: { canonical:", "webinar-canonical"],
  ["src/app/webinars/[slug]/page.tsx", '"@type": "VideoObject"', "webinar-schema"],
  ["src/app/webinars/[slug]/page.tsx", "resolvedThumbnailUrl(webinar)", "webinar-thumbnail-fallback"],
  ["src/app/webinars/[slug]/room/page.tsx", "robots: { index: false, follow: false }", "webinar-room-noindex"],
  ["src/app/webinars/page.tsx", "alternates: { canonical:", "webinar-library-canonical"],
  ["src/app/webinars/page.tsx", "images: [OG_IMAGE]", "webinar-library-og-image"],
];
for (const [file, needle, code] of codeChecks) {
  if (!fs.readFileSync(path.join(root, file), "utf8").includes(needle)) add(errors, code, `${file} is missing '${needle}'`);
}

if (checkUrls) {
  const urls = [...new Set(Object.values(blogSourceReviews).flatMap((review) => review.sources.map((source) => source.url)))];
  const results = await Promise.all(urls.map(async (url) => {
    try {
      let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(12000), headers: { "user-agent": "IndishMarketer-SEO-Audit/1.0" } });
      if (!response.ok && ![403, 429].includes(response.status)) response = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(12000), headers: { "user-agent": "Mozilla/5.0 IndishMarketer-SEO-Audit/1.0", range: "bytes=0-1024" } });
      return { url, status: response.status, ok: response.ok, inconclusive: [403, 405, 429].includes(response.status) };
    } catch (error) { return { url, error: error instanceof Error ? error.message : String(error), inconclusive: true }; }
  }));
  for (const result of results) {
    if (result.ok) continue;
    if (result.inconclusive) add(warnings, "source-check-inconclusive", `${result.url}: ${result.status || result.error}`);
    else add(errors, "broken-source-url", `${result.url}: HTTP ${result.status}`);
  }
  info.push({ code: "checked-source-urls", message: `Checked ${urls.length} unique source URLs` });
}

const report = { generatedAt: new Date().toISOString(), summary: { posts: posts.length, categories: categories.length, sourceReviewedArticles: Object.keys(blogSourceReviews).length, errors: errors.length, warnings: warnings.length }, errors, warnings, info };
if (reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
}
console.log(`SEO audit: ${posts.length} posts, ${Object.keys(blogSourceReviews).length} source-reviewed, ${errors.length} errors, ${warnings.length} warnings`);
for (const item of errors) console.error(`ERROR [${item.code}]${item.slug ? " " + item.slug + ":" : ""} ${item.message}`);
for (const item of warnings) console.warn(`WARN  [${item.code}]${item.slug ? " " + item.slug + ":" : ""} ${item.message}`);
if (reportPath) console.log(`Report: ${path.relative(root, reportPath)}`);
if (errors.length || (strict && warnings.length)) process.exitCode = 1;
