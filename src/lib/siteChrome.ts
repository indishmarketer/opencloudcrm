import { cache } from "react";
import { pool } from "@/lib/db";
import {
  DEFAULT_SITE_CHROME,
  SITE_CHROME_KEY,
  normalizeSiteChrome,
  type SiteChrome,
  type HeaderItem,
} from "@/lib/siteChromeShape";
import { getPublishedPage } from "@/lib/sitePages";

export type { SiteChrome } from "@/lib/siteChromeShape";

/** Built-in routes with their own page-builder row -- a link to one of
 * these (or a path under one) is hidden from nav/footer whenever the
 * owner has taken that page offline, same as any other unpublished page
 * would be. */
const MANAGED_PAGE_PREFIXES = ["/courses", "/webinars", "/reviews", "/tools", "/newsletter"];

function managedPagePrefixFor(path: string): string | null {
  return MANAGED_PAGE_PREFIXES.find((p) => path === p || path.startsWith(`${p}/`)) || null;
}

async function isLinkDisabled(path: string): Promise<boolean> {
  const prefix = managedPagePrefixFor(path);
  if (!prefix) return false;
  return !(await getPublishedPage(prefix));
}

async function filterLinks<T extends { href: string }>(links: T[]): Promise<T[]> {
  const disabled = await Promise.all(links.map((l) => isLinkDisabled(l.href)));
  return links.filter((_, i) => !disabled[i]);
}

/** Social links used to be NEXT_PUBLIC_SOCIAL_* env vars. Until the
 * navigation is saved once from the console, those still show. */
function legacySocialsFromEnv(): SiteChrome["socials"] {
  const socials: SiteChrome["socials"] = {};
  if (process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK) socials.facebook = process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK;
  if (process.env.NEXT_PUBLIC_SOCIAL_X) socials.x = process.env.NEXT_PUBLIC_SOCIAL_X;
  if (process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE) socials.youtube = process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE;
  if (process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN) socials.linkedin = process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN;
  return socials;
}

/** Server-only. Never throws -- falls back to the defaults if the table is
 * missing or the DB is unreachable (e.g. during `next build`). */
export async function readSiteChrome(): Promise<{ chrome: SiteChrome; saved: boolean }> {
  try {
    const result = await pool.query<{ value: string }>("SELECT value FROM site_settings WHERE key = $1", [SITE_CHROME_KEY]);
    if (result.rows[0]) return { chrome: normalizeSiteChrome(JSON.parse(result.rows[0].value)), saved: true };
  } catch (error) {
    console.error("site chrome: could not read from site_settings, using defaults.", error);
  }
  return { chrome: { ...DEFAULT_SITE_CHROME, socials: legacySocialsFromEnv() }, saved: false };
}

export const getSiteChrome = cache(async (): Promise<SiteChrome> => (await readSiteChrome()).chrome);

async function filterHeaderItem(item: HeaderItem): Promise<HeaderItem | null> {
  if (item.type === "link") return (await isLinkDisabled(item.href)) ? null : item;
  if (item.type === "dropdown") {
    const columns = (
      await Promise.all(item.columns.map(async (col) => ({ ...col, links: await filterLinks(col.links) })))
    ).filter((col) => col.links.length);
    return columns.length ? { ...item, columns } : null;
  }
  // "resources" only ever appears in the unsaved default chrome (see
  // DEFAULT_SITE_CHROME); NavClient itself gates its Courses/Webinars
  // columns using the flags it's given directly (see Nav.tsx).
  return item;
}

/** getSiteChrome(), with any header/footer link to a built-in page the
 * owner has taken offline removed -- what Nav.tsx and Footer.tsx should
 * render. getSiteChrome() itself stays unfiltered for the console's own
 * navigation editor, which must always show and let the owner edit every
 * saved link regardless of any page's publish state. */
export const getPublicSiteChrome = cache(async (): Promise<SiteChrome> => {
  const chrome = await getSiteChrome();
  const [items, footerColumns] = await Promise.all([
    Promise.all(chrome.header.items.map(filterHeaderItem)),
    Promise.all(chrome.footer.columns.map(async (col) => ({ ...col, links: await filterLinks(col.links) }))),
  ]);
  return {
    ...chrome,
    header: { ...chrome.header, items: items.filter((item): item is HeaderItem => item !== null) },
    footer: { ...chrome.footer, columns: footerColumns.filter((col) => col.links.length) },
  };
});

export async function saveSiteChrome(chrome: SiteChrome): Promise<void> {
  await pool.query(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [SITE_CHROME_KEY, JSON.stringify(chrome)]
  );
}
