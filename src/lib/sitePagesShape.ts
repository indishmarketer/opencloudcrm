/** Page records, URL rules, and the input cleaning shared by the console,
 * the REST API and MCP. No server-only imports (safe for client components
 * and node tests); the database side is src/lib/sitePages.ts. */

import { safeImageUrl, type PageBlock } from "@/lib/pageBlocks";

export type PageKind = "page" | "course" | "tool";
export type PageStatus = "draft" | "published";

/** What visitors see: frozen on Publish. */
export type PageSnapshot = {
  title: string;
  metaTitle: string;
  metaDescription: string;
  ogImage: string;
  noindex: boolean;
  blocks: PageBlock[];
};

export type SitePage = PageSnapshot & {
  id: number;
  kind: PageKind;
  path: string | null;
  refId: string | null;
  status: PageStatus;
  published: PageSnapshot | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  updatedBy: string | null;
};

/** URL prefixes owned by the app's own routes. A custom page can't take
 * one of these (it would never be reachable, or would shadow real
 * functionality). Kept in sync with src/app by test/sitePages.test.mjs. */
export const RESERVED_PATH_PREFIXES = [
  "/_next", "/.well-known", "/account", "/api", "/apply-to-write", "/author", "/blog", "/book", "/community",
  "/console", "/courses", "/forgot-password", "/guide", "/login", "/newsletter", "/oauth", "/preview",
  "/privacy-policy", "/refund-policy", "/reset-password", "/resources/prompt-skill-library",
  "/reviews", "/signup", "/terms", "/tools", "/unsubscribe", "/verify", "/verify-email", "/webinars",
  "/sitemap.xml", "/robots.txt", "/favicon.ico", "/icon.png", "/apple-icon.png", "/icon.tsx", "/apple-icon.tsx", "/badges", "/images", "/console-assets",
];

/** "About Us!" -> "/about-us"; "/Services/Web Design/" -> "/services/web-design". */
export function normalizePagePath(input: unknown): string {
  const raw = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (!raw || raw === "/") return "/";
  const segments = raw
    .split("/")
    .map((s) => s.replace(/[^a-z0-9-\s]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""))
    .filter(Boolean);
  return segments.length ? `/${segments.join("/")}` : "/";
}

/** Returns an error message, or null if a custom page may live at `path`. */
export function validatePagePath(path: string): string | null {
  if (path === "/") return null;
  if (!/^(\/[a-z0-9]+(-[a-z0-9]+)*){1,3}$/.test(path)) {
    return "Use lowercase letters, numbers and dashes, up to three levels deep (for example /pricing or /services/web-design).";
  }
  const clash = RESERVED_PATH_PREFIXES.find((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  if (clash) return `${clash} is used by a built-in part of the site. Pick a different address.`;
  return null;
}

const str = (value: unknown, limit: number) => (typeof value === "string" ? value.trim().slice(0, limit) : "");

/** The editable metadata fields of a page (everything except blocks). */
export type PageMetaInput = {
  title: string;
  metaTitle: string;
  metaDescription: string;
  ogImage: string;
  noindex: boolean;
};

export function normalizePageMeta(raw: Record<string, unknown>, current?: PageMetaInput): PageMetaInput {
  const pick = <K extends keyof PageMetaInput>(key: K, clean: (v: unknown) => PageMetaInput[K], fallback: PageMetaInput[K]) =>
    raw[key] === undefined ? (current ? current[key] : fallback) : clean(raw[key]);
  return {
    title: pick("title", (v) => str(v, 200), ""),
    metaTitle: pick("metaTitle", (v) => str(v, 200), ""),
    metaDescription: pick("metaDescription", (v) => str(v, 400), ""),
    ogImage: pick("ogImage", (v) => safeImageUrl(v), ""),
    noindex: pick("noindex", (v) => v === true, false),
  };
}

/** Accepts snake_case too (meta_title...), so REST callers can use either. */
export function camelizePageInput(raw: unknown): Record<string, unknown> {
  const r = raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
  const aliases: Record<string, string> = {
    meta_title: "metaTitle",
    meta_description: "metaDescription",
    og_image: "ogImage",
  };
  for (const [snake, camel] of Object.entries(aliases)) {
    if (r[snake] !== undefined && r[camel] === undefined) r[camel] = r[snake];
  }
  return r;
}

/** JSON with object keys sorted, so two values that differ only in key
 * order (Postgres jsonb reorders keys) compare equal. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** True when the working copy differs from what visitors currently see. */
export function hasUnpublishedChanges(page: Pick<SitePage, keyof PageSnapshot | "published">): boolean {
  if (!page.published) return true;
  const current: PageSnapshot = {
    title: page.title,
    metaTitle: page.metaTitle,
    metaDescription: page.metaDescription,
    ogImage: page.ogImage,
    noindex: page.noindex,
    blocks: page.blocks,
  };
  return canonicalJson(current) !== canonicalJson(page.published);
}

/** The file format of Console -> Pages -> Export / Import. */
export const PAGE_EXPORT_FORMAT = "opencloudcrm-pages@1";
