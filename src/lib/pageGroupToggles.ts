import { cache } from "react";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db";
import { getPublishedPage } from "@/lib/sitePages";
import {
  PAGE_GROUP_TOGGLES_KEY,
  FRESH_INSTALL_DEFAULTS,
  ALL_GROUPS_ON,
  normalizePageGroupToggles,
  type PageGroup,
  type PageGroupToggles,
} from "@/lib/pageGroupTogglesShape";

export type { PageGroup, PageGroupToggles } from "@/lib/pageGroupTogglesShape";

const SEED_FLAG = "page_group_toggles_seeded";

/** Seeds the toggle row exactly once per database, the first time anything
 * asks for it. A deployment whose homepage has ever been published (real
 * usage -- e.g. indishmarketer.com) comes out of this seed with every
 * group ON, so nothing it currently has live can disappear just because
 * this feature shipped. A genuinely fresh, never-published install (the
 * same signal src/app/page.tsx's NotLiveYet check uses) seeds to the
 * documented minimal defaults instead. Deleting/editing the row later
 * never re-seeds it. */
async function ensureSeeded(): Promise<void> {
  const flag = await pool.query("SELECT 1 FROM site_settings WHERE key = $1", [SEED_FLAG]);
  if (flag.rowCount) return;
  const homepagePublished = Boolean(await getPublishedPage("/"));
  const defaults = homepagePublished ? ALL_GROUPS_ON : FRESH_INSTALL_DEFAULTS;
  await pool.query(
    "INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO NOTHING",
    [PAGE_GROUP_TOGGLES_KEY, JSON.stringify(defaults)]
  );
  await pool.query(
    "INSERT INTO site_settings (key, value, updated_at) VALUES ($1, 'true', now()) ON CONFLICT (key) DO NOTHING",
    [SEED_FLAG]
  );
}

let seedCheck: Promise<void> | null = null;
function ensureSeededOnce(): Promise<void> {
  if (!seedCheck) {
    seedCheck = ensureSeeded().catch((error) => {
      seedCheck = null;
      throw error;
    });
  }
  return seedCheck;
}

async function readPageGroupToggles(): Promise<PageGroupToggles> {
  try {
    await ensureSeededOnce();
    const result = await pool.query<{ value: string }>("SELECT value FROM site_settings WHERE key = $1", [PAGE_GROUP_TOGGLES_KEY]);
    if (result.rows[0]) return normalizePageGroupToggles(JSON.parse(result.rows[0].value), ALL_GROUPS_ON);
  } catch (error) {
    console.error("page group toggles: could not read from site_settings, defaulting every group on.", error);
  }
  // DB unreachable (next build, or a transient outage): default every
  // group ON rather than off -- a read failure must never make real,
  // already-live content disappear or 404.
  return { ...ALL_GROUPS_ON };
}

export const getPageGroupToggles = cache(readPageGroupToggles);

export async function savePageGroupToggles(partial: unknown): Promise<PageGroupToggles> {
  const current = await readPageGroupToggles();
  const next = normalizePageGroupToggles(partial, current);
  await pool.query(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [PAGE_GROUP_TOGGLES_KEY, JSON.stringify(next)]
  );
  try {
    revalidatePath("/", "layout");
  } catch {
    // Outside a request (e.g. a script): nothing cached to clear.
  }
  return next;
}

/** Call as the first statement in a page group's route components
 * (courses, webinars, reviews, tools, newsletter, meetings, refund
 * policy) -- 404s the request when that group is turned off. */
export async function requirePageGroupEnabled(group: PageGroup): Promise<void> {
  const toggles = await getPageGroupToggles();
  if (!toggles[group]) notFound();
}
