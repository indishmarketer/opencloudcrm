import Link from "next/link";
import Avatar from "@/components/Avatar";
import ModuleNotConfigured from "@/components/ModuleNotConfigured";
import { FEATURES } from "@/config/features";
import WhatsAppDeleteConversation from "@/components/WhatsAppDeleteConversation";
import { getAdminSessionEmail } from "@/lib/auth";
import { pool } from "@/lib/db";
import { formatInboxTime } from "@/lib/whatsappFormat";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Conversation = {
  key: string;
  contact_id: string | null;
  name: string | null;
  email: string | null;
  number: string | null;
  direction: string;
  body: string | null;
  status: string | null;
  created_at: string;
  message_count: number;
  unread_count: number;
};

export default async function WhatsAppInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  if (!FEATURES.whatsapp) return <ModuleNotConfigured title="WhatsApp isn't connected yet" envVars={["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_WABA_ID"]} />;

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  // Unread is per person: what this admin has not looked at.
  const admin = (await getAdminSessionEmail()) || "";
  const offset = (page - 1) * PAGE_SIZE;

  // One row per conversation, newest first: DISTINCT ON picks each
  // conversation's latest message, then the outer query orders those by
  // time so the most recently active person is at the top.
  //
  // One extra row is fetched beyond the page size, purely to know whether
  // a next page exists without counting every conversation.
  const result = await pool.query<Conversation>(
    `WITH threads AS (
       SELECT
         COALESCE('c-' || contact_id::text,
                  'p-' || regexp_replace(COALESCE(from_number, to_number), '\\D', '', 'g')) AS key,
         contact_id,
         COALESCE(from_number, to_number) AS number,
         direction, body, status, created_at
       FROM whatsapp_messages
       WHERE contact_id IS NOT NULL OR COALESCE(from_number, to_number) IS NOT NULL
     ),
     latest AS (
       SELECT DISTINCT ON (key) key, contact_id, number, direction, body, status, created_at
       FROM threads ORDER BY key, created_at DESC
     )
     SELECT l.*, c.name, c.email,
            (SELECT count(*)::int FROM threads t WHERE t.key = l.key) AS message_count,
            -- Anything they sent since the last time this thread was
            -- opened in the console. A conversation never opened has no
            -- read row, so every inbound message in it counts.
            (SELECT count(*)::int FROM threads t
              WHERE t.key = l.key AND t.direction = 'inbound'
                AND t.created_at > COALESCE(r.last_read_at, to_timestamp(0))) AS unread_count
     FROM latest l
     LEFT JOIN contacts c ON c.id = l.contact_id
     LEFT JOIN whatsapp_conversation_reads r ON r.conversation_key = l.key AND r.admin_email = $3
     ORDER BY l.created_at DESC
     LIMIT $1 OFFSET $2`,
    [PAGE_SIZE + 1, offset, admin],
  );

  const now = (await pool.query<{ now: Date }>("SELECT now() AS now")).rows[0].now.toISOString();
  const hasNext = result.rows.length > PAGE_SIZE;
  const rows = result.rows.slice(0, PAGE_SIZE);

  return (
    <div>
      <p className="mb-6 max-w-2xl text-sm text-ink-soft">
        Every WhatsApp conversation, most recently active first. Open one to read the thread and reply.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center">
          <p className="font-medium">{page > 1 ? "Nothing on this page" : "No conversations yet"}</p>
          <p className="mt-1 text-sm text-ink-soft">
            {page > 1 ? "Go back a page." : "Messages sent and received will appear here."}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
          {rows.map((row) => {
            const unread = row.unread_count || 0;
            return (
              <div key={row.key} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-paper-soft">
                <Link href={`/console/whatsapp/messages/${row.key}`} className="flex min-w-0 flex-1 items-center gap-4">
                  <Avatar name={row.name} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{row.name || row.number || "Unknown number"}</span>
                      {!row.contact_id && (
                        <span className="rounded-full bg-paper-soft px-2 py-0.5 text-xs text-ink-soft">Not a contact</span>
                      )}
                    </span>
                    <span className={`mt-1 block truncate text-sm ${unread ? "font-medium text-ink" : "text-ink-soft"}`}>
                      {row.direction === "outbound" && "You: "}
                      {row.body || <span className="italic">No text</span>}
                    </span>
                  </span>
                </Link>
                <div className="shrink-0 text-right">
                  <p className={`text-xs ${unread ? "font-medium text-green-700" : "text-ink-soft"}`}>
                    {formatInboxTime(row.created_at, now)}
                  </p>
                  <p className="mt-1 flex items-center justify-end gap-2 text-xs text-ink-soft">
                    {unread > 0 && (
                      <span
                        className="flex h-5 min-w-5 items-center justify-center rounded-full bg-green-600 px-1.5 text-xs font-medium text-white"
                        title={`${unread} unread message${unread === 1 ? "" : "s"}`}
                      >
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                    <span>
                      {row.message_count} message{row.message_count === 1 ? "" : "s"}
                    </span>
                  </p>
                </div>
                <WhatsAppDeleteConversation
                  conversationKey={row.key}
                  name={row.name || row.number || "this number"}
                  className="shrink-0"
                />
              </div>
            );
          })}
        </div>
      )}

      {(page > 1 || hasNext) && (
        <div className="mt-6 flex items-center justify-between">
          {page > 1 ? (
            <Link
              href={`/console/whatsapp/messages?page=${page - 1}`}
              className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink"
            >
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <p className="text-xs text-ink-soft">Page {page}</p>
          {hasNext ? (
            <Link
              href={`/console/whatsapp/messages?page=${page + 1}`}
              className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink"
            >
              Older →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
