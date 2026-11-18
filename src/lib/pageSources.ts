import type { NextRequest } from "next/server";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { HARDCODED_PAGE_SOURCES, hardcodedPageSource } from "@/lib/pageSourcesShape";

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
  const raw = req.cookies.get("im_src_path")?.value;
  if (!raw) return "";
  try {
    return await getPageSource(decodeURIComponent(raw));
  } catch {
    return "";
  }
}

/** The source label of the page a request was made from (its Referer),
 * when it is one of this site's own pages. */
export async function pageSourceFromRequest(req: NextRequest | Request): Promise<string> {
  const referer = req.headers.get("referer");
  if (!referer) return "";
  try {
    const url = new URL(referer);
    const site = new URL(SITE_URL);
    const host = req.headers.get("host");
    if (url.host !== site.host && url.host !== host) return "";
    return await getPageSource(url.pathname);
  } catch {
    return "";
  }
}
