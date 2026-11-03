import { pool } from "@/lib/db";
import { mediaKindFromName } from "@/lib/whatsappMediaStore";
import { templatesForRendering } from "@/lib/whatsappTemplates";
import type { ConversationKey } from "@/lib/whatsappContacts";
import type { WhatsAppTemplate } from "@/lib/whatsappTemplateShape";

/** Loading one conversation's messages, in the shape the thread renders.
 *
 * Shared by the page and by the endpoint the open thread polls, because
 * the work of turning a stored row into something readable is not trivial:
 * a template send is logged as its name and the values it was filled with,
 * never the finished text, so the words have to be rebuilt from the
 * approved template at Meta. Doing that in two places would mean the live
 * updates eventually disagreed with the page they are updating. */

export const THREAD_PAGE_SIZE = 100;

export type ThreadMessageRow = {
  id: number;
  direction: string;
  body: string | null;
  media_src: string | null;
  media_kind: "image" | "video" | "audio" | "file" | null;
  media_stored: boolean;
  status: string | null;
  error: string | null;
  created_at: string;
};

const SELECT = `SELECT id, direction, body, message_type, template_name, media_url, media_key, status,
                       created_at, raw, raw->>'error' AS error
                FROM whatsapp_messages`;

export async function loadThreadMessages(
  key: ConversationKey,
  page = 1,
): Promise<{ messages: ThreadMessageRow[]; hasOlder: boolean; total: number }> {
  const offset = (Math.max(1, page) - 1) * THREAD_PAGE_SIZE;

  // Newest first in SQL, then reversed for display. The first version
  // ordered ascending with a LIMIT, which on a long conversation showed its
  // oldest messages and hid everything recent -- the opposite of what a
  // chat window should do. Page 2 is the next slice of older messages.
  const result = await pool.query(
    key.kind === "contact"
      ? `${SELECT} WHERE contact_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`
      : `${SELECT}
         WHERE contact_id IS NULL AND regexp_replace(COALESCE(from_number, to_number), '\\D', '', 'g') = $1
         ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [key.kind === "contact" ? key.contactId : key.digits, THREAD_PAGE_SIZE + 1, offset],
  );

  const hasOlder = result.rows.length > THREAD_PAGE_SIZE;
  const rows = result.rows.slice(0, THREAD_PAGE_SIZE).reverse();

  // Only reach out to Meta if a template was actually sent in this slice.
  const needsTemplates = rows.some(
    (row) => row.message_type === "template" && (row.template_name || row.raw?.request?.template),
  );
  // Cached: this runs on every poll of an open thread, not once per page.
  const templates: WhatsAppTemplate[] = needsTemplates ? await templatesForRendering().catch(() => []) : [];

  // A template's own approved sample belongs to the template, not to the
  // message, so it is never offered for deletion on a message.
  const templateMedia = new Set(
    (await pool.query<{ media_url: string }>("SELECT media_url FROM whatsapp_template_media")).rows.map(
      (row) => row.media_url,
    ),
  );

  const messages = rows.map((row) => {
    const request = row.raw?.request as
      | {
          template?: {
            name?: string;
            language?: { code?: string };
            components?: { type?: string; parameters?: { type?: string; text?: string; image?: { link?: string } }[] }[];
          };
        }
      | undefined;
    const sentTemplate = request?.template;
    const sentTemplateName = sentTemplate?.name || (row.template_name as string | null);
    const approved =
      (sentTemplate &&
        (templates.find((item) => item.name === sentTemplateName && item.language === sentTemplate.language?.code) ||
          templates.find((item) => item.name === sentTemplateName))) ||
      templates.find((item) => item.name === sentTemplateName);
    const bodyTemplate = approved?.components.find((component) => component.type === "BODY")?.text || "";
    const bodyParams = sentTemplate?.components?.find((component) => component.type === "body")?.parameters || [];
    const resolvedBody = bodyTemplate.replace(/\{\{(\d+)\}\}/g, (match, n: string) => bodyParams[Number(n) - 1]?.text ?? match);
    const headerImage = sentTemplate?.components
      ?.find((component) => component.type === "header")
      ?.parameters?.find((parameter) => parameter.type === "image")?.image?.link;

    const publicUrl = (row.media_url as string | null) || headerImage || null;
    return {
      id: Number(row.id),
      direction: row.direction as string,
      // Preserve the wording captured when this message was sent. The live
      // template is only a fallback for older rows without a saved preview.
      body: (row.body as string | null) || resolvedBody || null,
      // A private file is fetched through the console's own route, which
      // checks the session; it has no URL that works without one.
      media_src: row.media_key ? `/api/console/whatsapp/messages/${row.id}/media` : publicUrl,
      media_kind: row.media_key
        ? mediaKindFromName(row.media_key as string)
        : publicUrl
          ? mediaKindFromName(publicUrl)
          : null,
      media_stored:
        Boolean(row.media_key) || (Boolean(row.media_url) && !templateMedia.has(row.media_url as string)),
      status: row.status as string | null,
      error: row.error as string | null,
      created_at: new Date(row.created_at).toISOString(),
    } satisfies ThreadMessageRow;
  });

  return { messages, hasOlder, total: result.rows.length };
}
