/** Whole-site-section on/off switches, managed from Console -> Site
 * Settings -> Page groups. Stored as one JSON value in site_settings
 * (key PAGE_GROUP_TOGGLES_KEY). When a group is off, its pages 404
 * (see src/lib/pageGroupToggles.ts's requirePageGroupEnabled), its links
 * disappear from the nav/footer (see src/lib/siteChrome.ts's
 * getPublicSiteChrome), and its routes drop out of the sitemap and site
 * search (src/app/sitemap.ts, src/app/api/search/route.ts).
 *
 * No imports on purpose: safe for client components and plain node tests.
 * The DB read/write/seeding lives in src/lib/pageGroupToggles.ts. */

export const PAGE_GROUP_TOGGLES_KEY = "page_group_toggles";

export const PAGE_GROUPS = ["courses", "webinars", "reviews", "tools", "newsletter", "meetings", "refundPolicy"] as const;
export type PageGroup = (typeof PAGE_GROUPS)[number];

export type PageGroupToggles = Record<PageGroup, boolean>;

/** URL prefixes each group owns. A path belongs to a group if it equals
 * one of these exactly, or starts with "<prefix>/". Every other path
 * (blog, legal pages other than refund, page-builder pages, account,
 * console, etc.) is never affected by any toggle. */
export const PAGE_GROUP_PATH_PREFIXES: Record<PageGroup, string[]> = {
  courses: ["/courses"],
  webinars: ["/webinars"],
  reviews: ["/reviews"],
  tools: ["/tools"],
  newsletter: ["/newsletter"],
  meetings: ["/book"],
  refundPolicy: ["/refund-policy"],
};

/** What a genuinely fresh, never-published install starts with: the
 * optional sections nobody has set up yet are off. */
export const FRESH_INSTALL_DEFAULTS: PageGroupToggles = {
  courses: false,
  webinars: false,
  reviews: false,
  tools: false,
  newsletter: false,
  meetings: false,
  refundPolicy: false,
};

/** Every group on -- the safe default for any deployment that already has
 * real content (see pageGroupToggles.ts's migration seed), and the
 * fallback whenever toggle state can't be read at all. */
export const ALL_GROUPS_ON: PageGroupToggles = {
  courses: true,
  webinars: true,
  reviews: true,
  tools: true,
  newsletter: true,
  meetings: true,
  refundPolicy: true,
};

export function normalizePageGroupToggles(input: unknown, fallback: PageGroupToggles): PageGroupToggles {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const result = { ...fallback };
  for (const group of PAGE_GROUPS) {
    if (typeof raw[group] === "boolean") result[group] = raw[group] as boolean;
  }
  return result;
}

/** The group that owns `path`, or null if no group claims it. */
export function pageGroupForPath(path: string): PageGroup | null {
  for (const group of PAGE_GROUPS) {
    for (const prefix of PAGE_GROUP_PATH_PREFIXES[group]) {
      if (path === prefix || path.startsWith(`${prefix}/`)) return group;
    }
  }
  return null;
}

export function isPathDisabled(path: string, toggles: PageGroupToggles): boolean {
  const group = pageGroupForPath(path);
  return group !== null && !toggles[group];
}
