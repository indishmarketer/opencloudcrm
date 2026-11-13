import { pool } from "@/lib/db";
import { sanitizeBlogHtml } from "@/lib/sanitizeBlogHtml";
import { normalizeBlock, type PageBlock } from "@/lib/pageBlocks";
import {
  normalizePopupName,
  normalizePopupSettings,
  type PopupSettings,
} from "@/lib/popupsShape";

export type Popup = {
  id: number;
  name: string;
  blocks: PageBlock[];
  settings: PopupSettings;
  updatedAt: string;
};

type PopupRow = {
  id: number;
  name: string;
  blocks: unknown;
  settings: unknown;
  updated_at: Date;
};

/** A popup holds elements, not page sections, so every block is validated
 * with the same `nestableOnly` rule a row's column uses. That is what keeps
 * a Hero or a built-in content marker out of a dialog. */
export function normalizePopupBlocks(raw: unknown): PageBlock[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 40).map((block) => normalizeBlock(block, sanitizeBlogHtml, { nestableOnly: true }));
}

function toPopup(row: PopupRow): Popup {
  return {
    id: row.id,
    name: row.name,
    blocks: normalizePopupBlocks(row.blocks),
    settings: normalizePopupSettings(row.settings),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function listPopups(): Promise<Popup[]> {
  const result = await pool.query<PopupRow>(
    "SELECT id, name, blocks, settings, updated_at FROM site_popups ORDER BY updated_at DESC",
  );
  return result.rows.map(toPopup);
}

/** Name and id only -- for the Button block's popup picker, which must not
 * pull every popup's whole element tree just to fill a dropdown. */
export async function listPopupOptions(): Promise<{ id: number; name: string }[]> {
  const result = await pool.query<{ id: number; name: string }>(
    "SELECT id, name FROM site_popups ORDER BY name",
  );
  return result.rows;
}

export async function getPopup(id: number): Promise<Popup | null> {
  if (!Number.isInteger(id) || id < 1) return null;
  const result = await pool.query<PopupRow>(
    "SELECT id, name, blocks, settings, updated_at FROM site_popups WHERE id = $1",
    [id],
  );
  return result.rows[0] ? toPopup(result.rows[0]) : null;
}

/** Every popup a page opens, in one query. Mirrors getPublicFormViews: the
 * page renderer resolves them server-side so a popup's contents ship with
 * the page instead of being fetched when it opens. */
export async function getPopupsByIds(ids: number[]): Promise<Record<number, Popup>> {
  const wanted = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (wanted.length === 0) return {};
  const result = await pool.query<PopupRow>(
    "SELECT id, name, blocks, settings, updated_at FROM site_popups WHERE id = ANY($1::int[])",
    [wanted],
  );
  const out: Record<number, Popup> = {};
  for (const row of result.rows) out[row.id] = toPopup(row);
  return out;
}

export async function createPopup(input: { name?: unknown; blocks?: unknown; settings?: unknown }): Promise<Popup> {
  const result = await pool.query<PopupRow>(
    `INSERT INTO site_popups (name, blocks, settings) VALUES ($1, $2::jsonb, $3::jsonb)
     RETURNING id, name, blocks, settings, updated_at`,
    [
      normalizePopupName(input.name),
      JSON.stringify(normalizePopupBlocks(input.blocks)),
      JSON.stringify(normalizePopupSettings(input.settings)),
    ],
  );
  return toPopup(result.rows[0]);
}

export async function updatePopup(
  id: number,
  input: { name?: unknown; blocks?: unknown; settings?: unknown },
): Promise<Popup | null> {
  const existing = await getPopup(id);
  if (!existing) return null;
  const result = await pool.query<PopupRow>(
    `UPDATE site_popups SET name = $2, blocks = $3::jsonb, settings = $4::jsonb, updated_at = now()
     WHERE id = $1 RETURNING id, name, blocks, settings, updated_at`,
    [
      id,
      input.name === undefined ? existing.name : normalizePopupName(input.name),
      JSON.stringify(input.blocks === undefined ? existing.blocks : normalizePopupBlocks(input.blocks)),
      JSON.stringify(input.settings === undefined ? existing.settings : normalizePopupSettings(input.settings)),
    ],
  );
  return result.rows[0] ? toPopup(result.rows[0]) : null;
}

export async function deletePopup(id: number): Promise<boolean> {
  const result = await pool.query("DELETE FROM site_popups WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}
