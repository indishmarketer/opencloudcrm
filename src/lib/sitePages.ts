import { cache } from "react";
import { revalidatePath } from "next/cache";
import { pool, isUniqueViolation } from "@/lib/db";
import { sanitizeBlogHtml } from "@/lib/sanitizeBlogHtml";
import { getBusiness } from "@/lib/businessProfile";
import { getSiteIdentity, resolveSiteName } from "@/lib/siteIdentity";
import { normalizeBlocks, applyMergeTags, BlockValidationError, type PageBlock } from "@/lib/pageBlocks";
import { mergeVars } from "@/components/pageBlocks/PageBlocks";
import {
  BUILT_IN_PAGES,
  BUILT_IN_PATHS,
  STARTER_PAGES,
  UNDELETABLE_PATHS,
  getBuiltInDefault,
} from "@/lib/defaultPages";
import {
  PAGE_EXPORT_FORMAT,
  camelizePageInput,
  normalizePageMeta,
  normalizePagePath,
  validatePagePath,
  type PageKind,
  type PageSnapshot,
  type SitePage,
} from "@/lib/sitePagesShape";

export { BlockValidationError } from "@/lib/pageBlocks";
export class PageError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type Row = {
  id: string;
  kind: PageKind;
  path: string | null;
  ref_id: string | null;
  title: string;
  meta_title: string;
  meta_description: string;
  og_image: string;
  noindex: boolean;
  status: "draft" | "published";
  blocks: PageBlock[];
  published: PageSnapshot | null;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
  updated_by: string | null;
};

function fromRow(row: Row): SitePage {
  return {
    id: Number(row.id),
    kind: row.kind,
    path: row.path,
    refId: row.ref_id,
    title: row.title,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    ogImage: row.og_image,
    noindex: row.noindex,
    status: row.status,
    blocks: row.blocks || [],
    published: row.published,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    publishedAt: row.published_at ? row.published_at.toISOString() : null,
    updatedBy: row.updated_by,
  };
}

const COLUMNS = "id, kind, path, ref_id, title, meta_title, meta_description, og_image, noindex, status, blocks, published, created_at, updated_at, published_at, updated_by";

function snapshotOf(page: PageSnapshot): PageSnapshot {
  return {
    title: page.title,
    metaTitle: page.metaTitle,
    metaDescription: page.metaDescription,
    ogImage: page.ogImage,
    noindex: page.noindex,
    blocks: page.blocks,
  };
}

/** Rich text is sanitized server-side on every write, whoever wrote it. */
function cleanBlocks(raw: unknown, allowBuiltIn: boolean): PageBlock[] {
  try {
    return normalizeBlocks(raw, sanitizeBlogHtml, { allowBuiltIn });
  } catch (error) {
    if (error instanceof BlockValidationError) throw new PageError(error.message);
    throw error;
  }
}

const STARTER_FLAG = "starter_pages_seeded";

/** Creates the neutral starter pages exactly once per database, the first
 * time anything asks for a page. Deleting one later doesn't bring it back.
 *
 * Seeded as drafts, not published: a fresh install should stay offline
 * (visitors see "not live yet" -- src/app/page.tsx) until the owner logs
 * into /console and publishes something on purpose, rather than going live
 * instantly with placeholder copy nobody wrote. This only touches the
 * one-time insert gated by STARTER_FLAG, so it can't retroactively affect a
 * database where these rows (and the flag) already exist and are published. */
async function ensureStarterPages(): Promise<void> {
  const flag = await pool.query("SELECT 1 FROM site_settings WHERE key = $1", [STARTER_FLAG]);
  if (flag.rowCount) return;
  // A starter "form" block can't name a form id at definition time -- the
  // forms table is seeded by migration, so ids differ per deployment. Any
  // starter form block is pointed at the seeded Contact form here; if that
  // form has since been deleted (it is an ordinary, deletable form), the
  // block seeds empty and the owner picks a form in the page editor.
  const contactForm = await pool
    .query<{ id: number }>("SELECT id FROM forms WHERE slug = 'contact' ORDER BY id LIMIT 1")
    .catch(() => null);
  const contactFormId = contactForm?.rows[0]?.id;
  const withFormIds = (blocks: PageBlock[]): PageBlock[] =>
    blocks.map((block) =>
      block.type === "form" && !block.props?.savedFormId && contactFormId
        ? { ...block, props: { ...block.props, savedFormId: String(contactFormId) } }
        : block,
    );

  for (const starter of STARTER_PAGES) {
    await pool.query(
      `INSERT INTO site_pages (kind, path, title, meta_title, meta_description, og_image, noindex, status, blocks, published, published_at, updated_by)
       VALUES ('page', $1, $2, $3, $4, $5, $6, 'draft', $7, NULL, NULL, 'starter')
       ON CONFLICT (path) WHERE kind = 'page' DO NOTHING`,
      [
        starter.path, starter.title, starter.metaTitle, starter.metaDescription, starter.ogImage, starter.noindex,
        JSON.stringify(withFormIds(starter.blocks)),
      ]
    );
  }
  await pool.query(
    "INSERT INTO site_settings (key, value, updated_at) VALUES ($1, 'true', now()) ON CONFLICT (key) DO NOTHING",
    [STARTER_FLAG]
  );
}

let starterCheck: Promise<void> | null = null;
function ensureStarterPagesOnce(): Promise<void> {
  if (!starterCheck) {
    starterCheck = ensureStarterPages().catch((error) => {
      starterCheck = null;
      throw error;
    });
  }
  return starterCheck;
}

declare global {
  // eslint-disable-next-line no-var
  var _lastKnownGoodPages: Map<string, PageSnapshot & { id: number | null }> | undefined;
}
function lastKnownGoodPages(): Map<string, PageSnapshot & { id: number | null }> {
  if (!global._lastKnownGoodPages) global._lastKnownGoodPages = new Map();
  return global._lastKnownGoodPages;
}

/** What visitors should see at `path`: the published snapshot, or for a
 * built-in route that has never had a row created for it at all, its code
 * defaults. null means "no page here" (404) -- including a built-in route
 * someone has deliberately taken offline (unpublishPage), not just a
 * custom page. Never throws.
 *
 * A DB read failure falls back to the last published snapshot this process
 * has actually served for `path`, not straight to the neutral starter copy
 * -- a rolling deploy briefly runs the old and new container against the
 * same DB, and a single flaky query on the fresh container would otherwise
 * get ISR-cached and served to real visitors until the next revalidation.
 * Only a path this process has never successfully read (a fresh container
 * that hasn't been warmed yet, or `next build` with no DB at all) falls all
 * the way back to the built-in/starter default. */
async function readPublishedPage(path: string): Promise<(PageSnapshot & { id: number | null }) | null> {
  try {
    await ensureStarterPagesOnce();
    const result = await pool.query<Row>(`SELECT ${COLUMNS} FROM site_pages WHERE kind = 'page' AND path = $1`, [path]);
    const row = result.rows[0];
    if (row && row.status === "published" && row.published) {
      const snapshot = { ...row.published, id: Number(row.id) };
      lastKnownGoodPages().set(path, snapshot);
      return snapshot;
    }
    // A row exists but isn't published -- offline, whether it's a custom
    // page or a built-in one someone deliberately unpublished. Only the
    // total absence of a row (a built-in route nobody has touched yet)
    // falls through to the code default below.
    if (row) return null;
  } catch (error) {
    console.error(`site pages: could not load ${path}, falling back to defaults.`, error);
    const cached = lastKnownGoodPages().get(path);
    if (cached) return cached;
  }
  const builtIn = getBuiltInDefault(path);
  if (builtIn) return { ...snapshotOf(builtIn), id: null };
  const starter = STARTER_PAGES.find((p) => p.path === path);
  return starter && path === "/" ? { ...snapshotOf(starter), id: null } : null;
}

export const getPublishedPage = cache(readPublishedPage);

/** Exported only so the health check can warm this process's last-known-good
 * cache for the homepage before Coolify routes real traffic to it -- not for
 * general use (callers should use getPublishedPage, which is deduplicated
 * per request). */
export const __warmPublishedPage = readPublishedPage;

/** Published page-builder snapshot for a course or tool, if one is live. */
export async function getPublishedEntityPage(kind: "course" | "tool", refId: string | number): Promise<PageSnapshot | null> {
  try {
    const result = await pool.query<{ published: PageSnapshot | null; status: string }>(
      "SELECT published, status FROM site_pages WHERE kind = $1 AND ref_id = $2",
      [kind, String(refId)]
    );
    const row = result.rows[0];
    return row && row.status === "published" && row.published ? row.published : null;
  } catch (error) {
    console.error(`site pages: could not load ${kind} ${refId} page.`, error);
    return null;
  }
}

/** Published extra sections for a tool page, which remains part of its listing. */
export async function getPublishedEntityBlocks(kind: "course" | "tool", refId: string | number): Promise<PageBlock[]> {
  const page = await getPublishedEntityPage(kind, refId);
  return page?.blocks || [];
}

export async function listPages(): Promise<SitePage[]> {
  await ensureStarterPagesOnce();
  const result = await pool.query<Row>(`SELECT ${COLUMNS} FROM site_pages WHERE kind = 'page' ORDER BY (path = '/') DESC, path`);
  return result.rows.map(fromRow);
}

/** Every page the console's Pages list shows: real rows, plus built-in
 * routes that have never been edited (id null, rendered from defaults). */
export async function listPagesWithBuiltIns(): Promise<{ pages: SitePage[]; untouchedBuiltIns: typeof BUILT_IN_PAGES }> {
  const pages = await listPages();
  const existing = new Set(pages.map((p) => p.path));
  return { pages, untouchedBuiltIns: BUILT_IN_PAGES.filter((p) => !existing.has(p.path)) };
}

export async function getPageById(id: number): Promise<SitePage | null> {
  const result = await pool.query<Row>(`SELECT ${COLUMNS} FROM site_pages WHERE id = $1`, [id]);
  return result.rows[0] ? fromRow(result.rows[0]) : null;
}

export async function getPageByPath(path: string): Promise<SitePage | null> {
  await ensureStarterPagesOnce();
  const result = await pool.query<Row>(`SELECT ${COLUMNS} FROM site_pages WHERE kind = 'page' AND path = $1`, [path]);
  return result.rows[0] ? fromRow(result.rows[0]) : null;
}

/** The row for a built-in route, a course or a tool, created from its
 * defaults on first edit. */
export async function getOrCreateEditablePage(
  target: { kind: "page"; path: string } | { kind: "course" | "tool"; refId: string; title: string },
  actor: string
): Promise<SitePage> {
  if (target.kind === "page") {
    const existing = await getPageByPath(target.path);
    if (existing) return existing;
    const builtIn = getBuiltInDefault(target.path);
    if (!builtIn) throw new PageError("No page exists at that address.", 404);
    return insertPage({ kind: "page", path: builtIn.path, refId: null, snapshot: snapshotOf(builtIn), publish: true, actor });
  }
  const result = await pool.query<Row>(`SELECT ${COLUMNS} FROM site_pages WHERE kind = $1 AND ref_id = $2`, [target.kind, target.refId]);
  if (result.rows[0]) return fromRow(result.rows[0]);
  return insertPage({
    kind: target.kind,
    path: null,
    refId: target.refId,
    snapshot: { title: target.title, metaTitle: "", metaDescription: "", ogImage: "", noindex: false, blocks: [] },
    publish: false,
    actor,
  });
}

async function insertPage(input: {
  kind: PageKind;
  path: string | null;
  refId: string | null;
  snapshot: PageSnapshot;
  publish: boolean;
  actor: string;
}): Promise<SitePage> {
  try {
    const result = await pool.query<Row>(
      `INSERT INTO site_pages (kind, path, ref_id, title, meta_title, meta_description, og_image, noindex, status, blocks, published, published_at, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING ${COLUMNS}`,
      [
        input.kind, input.path, input.refId, input.snapshot.title, input.snapshot.metaTitle, input.snapshot.metaDescription,
        input.snapshot.ogImage, input.snapshot.noindex, input.publish ? "published" : "draft",
        JSON.stringify(input.snapshot.blocks), input.publish ? JSON.stringify(input.snapshot) : null,
        input.publish ? new Date() : null, input.actor,
      ]
    );
    return fromRow(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new PageError("A page already exists at that address.", 409);
    throw error;
  }
}

/** Creates a custom page (draft unless `publish` is true). */
export async function createPage(raw: unknown, actor: string): Promise<SitePage> {
  await ensureStarterPagesOnce();
  const input = camelizePageInput(raw);
  const path = normalizePagePath(input.path);
  const pathError = validatePagePath(path);
  if (pathError) throw new PageError(pathError);
  if (BUILT_IN_PATHS.has(path)) throw new PageError("That address belongs to a built-in page. Edit it from the Pages list instead.", 409);
  const meta = normalizePageMeta(input);
  if (!meta.title) throw new PageError("Give the page a title.");
  const blocks = cleanBlocks(input.blocks ?? [], false);
  const page = await insertPage({ kind: "page", path, refId: null, snapshot: { ...meta, blocks }, publish: input.status === "published", actor });
  if (page.status === "published") revalidatePublic(page);
  return page;
}

/** Saves the working copy. Visitors keep seeing the last published
 * version until publishPage() (or `publish: true` here). */
export async function updatePage(id: number, raw: unknown, actor: string): Promise<SitePage> {
  const current = await getPageById(id);
  if (!current) throw new PageError("Page not found.", 404);
  const input = camelizePageInput(raw);
  const meta = normalizePageMeta(input, current);
  if (current.kind === "page" && !meta.title) throw new PageError("Give the page a title.");
  const allowBuiltIn = current.kind === "page" && BUILT_IN_PATHS.has(current.path || "");
  const blocks = input.blocks === undefined ? current.blocks : cleanBlocks(input.blocks, allowBuiltIn);

  let path = current.path;
  if (current.kind === "page" && input.path !== undefined) {
    const nextPath = normalizePagePath(input.path);
    if (nextPath !== current.path) {
      if (UNDELETABLE_PATHS.has(current.path || "") || BUILT_IN_PATHS.has(current.path || "")) {
        throw new PageError("This page's address can't be changed.");
      }
      const pathError = validatePagePath(nextPath);
      if (pathError) throw new PageError(pathError);
      if (BUILT_IN_PATHS.has(nextPath) || nextPath === "/") throw new PageError("That address belongs to a built-in page.", 409);
      path = nextPath;
    }
  }

  try {
    await pool.query(
      `UPDATE site_pages SET path = $2, title = $3, meta_title = $4, meta_description = $5, og_image = $6, noindex = $7,
         blocks = $8, updated_at = now(), updated_by = $9
       WHERE id = $1`,
      [id, path, meta.title, meta.metaTitle, meta.metaDescription, meta.ogImage, meta.noindex, JSON.stringify(blocks), actor]
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw new PageError("A page already exists at that address.", 409);
    throw error;
  }
  if (path !== current.path) revalidatePublic(current);
  if (input.publish === true || input.status === "published") return publishPage(id, actor);
  if (input.status === "draft") return unpublishPage(id, actor);
  return (await getPageById(id))!;
}

export async function publishPage(id: number, actor: string): Promise<SitePage> {
  const current = await getPageById(id);
  if (!current) throw new PageError("Page not found.", 404);
  await pool.query(
    `UPDATE site_pages SET status = 'published', published = $2, published_at = now(), updated_at = now(), updated_by = $3 WHERE id = $1`,
    [id, JSON.stringify(snapshotOf(current)), actor]
  );
  const page = (await getPageById(id))!;
  revalidatePublic(page);
  return page;
}

/** Takes a page offline (404) without deleting it -- including a built-in
 * page (courses, webinars, reviews, tools directory, newsletter...): the
 * owner decides whether their site needs that section at all, same as any
 * other page. Only the homepage can't go offline (see NotLiveYet/"/" --
 * it has its own dedicated empty state instead). */
export async function unpublishPage(id: number, actor: string): Promise<SitePage> {
  const current = await getPageById(id);
  if (!current) throw new PageError("Page not found.", 404);
  if (current.kind === "page" && UNDELETABLE_PATHS.has(current.path || "")) {
    throw new PageError("The homepage can't go offline. Edit it instead.");
  }
  await pool.query(`UPDATE site_pages SET status = 'draft', updated_at = now(), updated_by = $2 WHERE id = $1`, [id, actor]);
  revalidatePublic(current);
  return (await getPageById(id))!;
}

/** Deletes a custom page; on a built-in page, resets it to its defaults. */
export async function deletePage(id: number): Promise<{ reset: boolean }> {
  const current = await getPageById(id);
  if (!current) throw new PageError("Page not found.", 404);
  if (current.kind === "page" && UNDELETABLE_PATHS.has(current.path || "")) {
    throw new PageError("The homepage can't be deleted. Edit it instead.");
  }
  await pool.query("DELETE FROM site_pages WHERE id = $1", [id]);
  revalidatePublic(current);
  return { reset: current.kind === "page" && BUILT_IN_PATHS.has(current.path || "") };
}

function revalidatePublic(page: Pick<SitePage, "kind" | "path">) {
  try {
    // Nav/footer don't depend on pages, but the sitemap and any page
    // linking here might; the whole-layout revalidate is what the rest of
    // the app already does on content changes (e.g. blog publish).
    revalidatePath("/", "layout");
  } catch {
    // Outside a request (e.g. a script): nothing cached to clear.
  }
  void page;
}

/** Console -> Pages -> Export: every page (published versions and working
 * copies) as one JSON file another deployment can import. */
export async function exportPages(extra: Record<string, unknown> = {}) {
  const pages = await listPages();
  return {
    format: PAGE_EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    pages: pages.map((p) => ({
      path: p.path,
      status: p.status,
      title: p.title,
      metaTitle: p.metaTitle,
      metaDescription: p.metaDescription,
      ogImage: p.ogImage,
      noindex: p.noindex,
      blocks: p.blocks,
    })),
    ...extra,
  };
}

/** Upserts pages by path. Published pages in the file are published
 * immediately; others land as drafts. Returns per-page outcomes so the
 * console can say exactly what happened. */
export async function importPages(file: unknown, actor: string): Promise<{ path: string; result: "created" | "updated" | "error"; error?: string }[]> {
  const data = file && typeof file === "object" ? (file as Record<string, unknown>) : {};
  if (data.format !== PAGE_EXPORT_FORMAT) throw new PageError(`This isn't a pages export file (expected format "${PAGE_EXPORT_FORMAT}").`);
  if (!Array.isArray(data.pages)) throw new PageError("The file has no pages in it.");
  await ensureStarterPagesOnce();
  const outcomes: { path: string; result: "created" | "updated" | "error"; error?: string }[] = [];
  for (const raw of data.pages.slice(0, 200)) {
    const entry = camelizePageInput(raw);
    const path = normalizePagePath(entry.path);
    try {
      const existing = await getPageByPath(path);
      if (existing) {
        await updatePage(existing.id, { ...entry, path: undefined, publish: entry.status === "published" }, actor);
        outcomes.push({ path, result: "updated" });
      } else if (BUILT_IN_PATHS.has(path)) {
        const created = await getOrCreateEditablePage({ kind: "page", path }, actor);
        await updatePage(created.id, { ...entry, path: undefined, publish: true }, actor);
        outcomes.push({ path, result: "updated" });
      } else {
        await createPage(entry, actor);
        outcomes.push({ path, result: "created" });
      }
    } catch (error) {
      outcomes.push({ path, result: "error", error: error instanceof Error ? error.message : "Failed." });
    }
  }
  return outcomes;
}

/** Published, indexable page-builder pages, for the sitemap and search. */
export async function listPublishedPageEntries(): Promise<{ path: string; title: string; description: string; updatedAt: string }[]> {
  try {
    await ensureStarterPagesOnce();
    const result = await pool.query<{ path: string; published: PageSnapshot; updated_at: Date }>(
      `SELECT path, published, COALESCE(published_at, updated_at) AS updated_at FROM site_pages
       WHERE kind = 'page' AND status = 'published' AND published IS NOT NULL`
    );
    const [business, identity] = await Promise.all([getBusiness(), getSiteIdentity()]);
    const siteName = resolveSiteName(identity);
    const vars = mergeVars(business, siteName);
    return result.rows
      .filter((r) => !r.published.noindex)
      .map((r) => {
        const title = applyMergeTags(r.published.metaTitle || r.published.title, vars);
        return {
          path: r.path,
          // "Home" is the page's own internal/admin label, not something a
          // visitor should see -- same substitution sitePageMetadata makes
          // for the <title> tag, reused here for search results etc.
          title: r.path === "/" && title === "Home" ? siteName : title,
          description: applyMergeTags(r.published.metaDescription, vars),
          updatedAt: r.updated_at.toISOString(),
        };
      });
  } catch (error) {
    console.error("site pages: could not list published pages.", error);
    return [];
  }
}
