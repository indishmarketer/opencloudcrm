import type { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { sourcePath } from "@/lib/pageSourcesShape";

export async function getPageSource(path: string): Promise<string> {
  const clean = sourcePath(path);
  if (!clean) return "";
  const result = await pool.query<{ label: string }>("SELECT label FROM page_sources WHERE path = $1", [clean]).catch(() => ({ rows: [] }));
  return result.rows[0]?.label || "";
}

export async function setPageSource(path: string, label: string): Promise<void> {
  const clean = sourcePath(path);
  if (!clean) throw new Error("Invalid page address.");
  if (!label) await pool.query("DELETE FROM page_sources WHERE path = $1", [clean]);
  else await pool.query(
    `INSERT INTO page_sources (path, label) VALUES ($1, $2)
     ON CONFLICT (path) DO UPDATE SET label = EXCLUDED.label, updated_at = now()`,
    [clean, label],
  );
}

export async function listPageSources(): Promise<{ path: string; label: string }[]> {
  const result = await pool.query<{ path: string; label: string }>("SELECT path, label FROM page_sources ORDER BY path").catch(() => ({ rows: [] }));
  return result.rows;
}

/** The source label of the last ordinary page the visitor viewed before
 * signing up (SourcePathTracker's cookie), for a new account's second
 * source. */
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
