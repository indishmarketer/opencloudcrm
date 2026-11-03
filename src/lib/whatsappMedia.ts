import { pool } from "@/lib/db";
import { deleteFromR2 } from "@/lib/r2Upload";
import { deleteConversationMedia } from "@/lib/whatsappMediaStore";

/** Removing WhatsApp media from storage.
 *
 * Every photo or video that goes through a conversation -- ours on the way
 * out, theirs on the way in -- is stored by us, because Meta needs a URL to
 * fetch outbound media from and never hands an inbound file back twice.
 * That storage is paid for and grows forever, so it has to be removable:
 * by hand from the console, and on its own once it is old enough.
 *
 * Two shapes exist. New files are an object key in the private bucket, one
 * per message, owned by that message alone. Older files, and every media
 * template's approved sample, are public URLs in the images bucket -- and a
 * template's sample is pointed at by every send of that template, so
 * deleting "this message's image" there could break the template and every
 * message that used it. Nothing here deletes an object that anything else
 * still points at. */

/** Whether a public URL is used by anything other than the given messages. */
async function urlSharedElsewhere(url: string, exceptMessageIds: number[]): Promise<boolean> {
  const [messages, templates] = await Promise.all([
    pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM whatsapp_messages
       WHERE media_url = $1 AND NOT (id = ANY($2::bigint[]))`,
      [url, exceptMessageIds],
    ),
    pool.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM whatsapp_template_media WHERE media_url = $1",
      [url],
    ),
  ]);
  return Number(messages.rows[0]?.n || 0) > 0 || Number(templates.rows[0]?.n || 0) > 0;
}

type MediaRow = { id: number; media_key: string | null; media_url: string | null };

/** Deletes the files for a set of rows and forgets them. Returns how many
 * objects actually went. */
async function purge(rows: MediaRow[]): Promise<number> {
  const ids = rows.map((row) => row.id);
  let deleted = 0;

  // A key belongs to exactly one message, so it can always go.
  const keyed = rows.filter((row) => row.media_key);
  for (const row of keyed) {
    await deleteConversationMedia(row.media_key!);
    deleted += 1;
  }

  // A public URL might be shared: with a template, or with the other
  // recipients of the same campaign.
  const urls = [...new Set(rows.filter((row) => !row.media_key && row.media_url).map((row) => row.media_url!))];
  const removable: string[] = [];
  for (const url of urls) {
    if (await urlSharedElsewhere(url, ids)) continue;
    await deleteFromR2(url);
    removable.push(url);
    deleted += 1;
  }

  // Only forget a URL we were actually allowed to delete; a shared one
  // stays on its row, because the file is still there and still theirs.
  await pool.query(
    `UPDATE whatsapp_messages
     SET media_key = NULL,
         media_url = CASE WHEN media_url = ANY($2::text[]) THEN NULL ELSE media_url END
     WHERE id = ANY($1::bigint[])`,
    [ids, removable],
  );
  return deleted;
}

export type MediaDeleteResult = { ok: true } | { ok: false; error: string };

/** Deletes one message's attachment and forgets it. The message itself
 * stays: what was said is the record, the file is not. */
export async function deleteMessageMedia(messageId: number): Promise<MediaDeleteResult> {
  const row = (
    await pool.query<MediaRow>("SELECT id, media_key, media_url FROM whatsapp_messages WHERE id = $1", [messageId])
  ).rows[0];
  if (!row) return { ok: false, error: "That message no longer exists." };
  if (!row.media_key && !row.media_url) return { ok: false, error: "That message has no stored file." };

  if (!row.media_key && row.media_url && (await urlSharedElsewhere(row.media_url, [messageId]))) {
    return {
      ok: false,
      error: "This file belongs to a message template or was sent to more than one person, so deleting it here would break the others.",
    };
  }

  await purge([row]);
  return { ok: true };
}

/** Deletes every file belonging to a set of messages, skipping any that
 * something else still points at. */
export async function deleteMediaForMessages(messageIds: number[]): Promise<number> {
  if (messageIds.length === 0) return 0;
  const rows = await pool.query<MediaRow>(
    `SELECT id, media_key, media_url FROM whatsapp_messages
     WHERE id = ANY($1::bigint[]) AND (media_key IS NOT NULL OR media_url IS NOT NULL)`,
    [messageIds],
  );
  return purge(rows.rows);
}

/** How long a conversation file is kept before it is thrown away on its
 * own. The message stays; only the file goes, the same as deleting one by
 * hand. Set WHATSAPP_MEDIA_RETENTION_DAYS to 0 to keep everything. */
export function mediaRetentionDays(): number {
  const raw = Number(process.env.WHATSAPP_MEDIA_RETENTION_DAYS);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 180;
}

/** The daily sweep. Without it the bucket only ever grows: every photo
 * anyone has ever sent is still being paid for, and nobody is going to
 * remember to go back through old conversations deleting them.
 *
 * Capped per run so one sweep after a long backlog cannot tie up the cron;
 * whatever is left goes tomorrow. */
export async function pruneExpiredMedia(limit = 200): Promise<{ deleted: number; scanned: number }> {
  const days = mediaRetentionDays();
  if (days === 0) return { deleted: 0, scanned: 0 };

  const rows = await pool.query<MediaRow>(
    `SELECT m.id, m.media_key, m.media_url FROM whatsapp_messages m
     WHERE (m.media_key IS NOT NULL OR m.media_url IS NOT NULL)
       AND m.created_at < now() - ($1 || ' days')::interval
       -- A template's approved sample can never be deleted, so leaving it
       -- in the window would park the oldest rows at the front of every
       -- sweep from now on and the newer ones would never be reached.
       AND (m.media_key IS NOT NULL OR NOT EXISTS (
         SELECT 1 FROM whatsapp_template_media t WHERE t.media_url = m.media_url
       ))
     ORDER BY m.created_at
     LIMIT $2`,
    [String(days), limit],
  );
  if (rows.rows.length === 0) return { deleted: 0, scanned: 0 };

  const deleted = await purge(rows.rows);
  return { deleted, scanned: rows.rows.length };
}
