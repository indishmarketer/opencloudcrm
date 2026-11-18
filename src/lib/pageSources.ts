import type { NextRequest } from "next/server";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { HARDCODED_PAGE_SOURCES, hardcodedPageSource, sourcePath } from "@/lib/pageSourcesShape";

export type PageSourceTag = { label: string; path: string };

export async function getPageSource(path: string): Promise<string> {
  return hardcodedPageSource(path);
}

export async function listPageSources(): Promise<{ path: string; label: string }[]> {
  return HARDCODED_PAGE_SOURCES.map((source) => ({ ...source }));
}

/** The source label of the last ordinary page the visitor viewed before
 * signing up (SourcePathTracker's cookie), for a new account's second
 * source. The label is derived from code, not a database setting. */
export async function originPageSource(req: NextRequest): Promise<string> {
  return (await originPageSourceTag(req))?.label || "";
}

/** The code-owned label and exact internal page visited before an auth step.
 * Keeping the path prevents useful detail such as /blog/post-slug from being
 * collapsed into either a generic label or an external referrer host. */
export async function originPageSourceTag(req: NextRequest): Promise<PageSourceTag | null> {
  const raw = req.cookies.get("im_src_path")?.value;
  if (!raw) return null;
  try {
    const path = sourcePath(decodeURIComponent(raw));
    return path ? { label: await getPageSource(path), path } : null;
  } catch {
    return null;
  }
}

/** The source label of the page a request was made from (its Referer),
 * when it is one of this site's own pages. */
export async function pageSourceFromRequest(req: NextRequest | Request): Promise<string> {
  return (await pageSourceTagFromRequest(req))?.label || "";
}

/** The precise internal page that submitted a form. The short label is used
 * for grouping in Contacts (Blog, Newsletter, Course, ...), while `path`
 * keeps the exact clickable page such as /blog/how-to-write-a-headline.
 * External Referers are deliberately rejected: they belong to attribution,
 * not to the contact's on-site source. */
export async function pageSourceTagFromRequest(req: NextRequest | Request): Promise<PageSourceTag | null> {
  const referer = req.headers.get("referer");
  if (!referer) return null;
  try {
    const url = new URL(referer);
    const site = new URL(SITE_URL);
    const host = req.headers.get("host");
    if (url.host !== site.host && url.host !== host) return null;
    const path = sourcePath(url.pathname);
    return path ? { label: await getPageSource(path), path } : null;
  } catch {
    return null;
  }
}
