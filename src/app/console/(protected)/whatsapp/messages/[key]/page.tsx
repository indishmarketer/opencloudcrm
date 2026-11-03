import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import Avatar from "@/components/Avatar";
import ModuleNotConfigured from "@/components/ModuleNotConfigured";
import { FEATURES } from "@/config/features";
import WhatsAppThread from "@/components/WhatsAppThread";
import WhatsAppDeleteConversation from "@/components/WhatsAppDeleteConversation";
import { parseConversationKey, replyWindow } from "@/lib/whatsappContacts";
import { loadThreadMessages } from "@/lib/whatsappThread";

export const dynamic = "force-dynamic";

export default async function WhatsAppThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  if (!FEATURES.whatsapp) return <ModuleNotConfigured title="WhatsApp isn't connected yet" envVars={["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_WABA_ID"]} />;

  const { key } = await params;
  const parsed = parseConversationKey(key);
  if (!parsed) notFound();

  const page = Math.max(1, Number((await searchParams).page) || 1);

  const { messages: rows, hasOlder, total } = await loadThreadMessages(parsed, page);
  if (total === 0) notFound();

  const contact =
    parsed.kind === "contact"
      ? (
          await pool.query<{ id: string; name: string | null; email: string; phone: string | null; whatsapp_status: string }>(
            "SELECT id, name, email, phone, whatsapp_status FROM contacts WHERE id = $1",
            [parsed.contactId],
          )
        ).rows[0] ?? null
      : null;

  const now = (await pool.query<{ now: Date }>("SELECT now() AS now")).rows[0].now;

  const window = await replyWindow(parsed);
  const number =
    contact?.phone ||
    (parsed.kind === "phone" ? parsed.digits : null) ||
    null;

  // The mobile height subtracts the console's own phone chrome (sticky
  // header, section menu, page padding), which is roughly 10rem. The old
  // 16rem was a guess that left the thread itself about a third of the
  // screen with the reply box crushed underneath it.
  return (
    <div className="flex h-[calc(100dvh-11rem)] min-h-0 flex-col md:h-[calc(100dvh-4rem)]">
      <div className="shrink-0">
      <Link href="/console/whatsapp/messages" className="text-sm text-ink-soft hover:text-ink">
        ← All conversations
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 sm:mt-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={contact?.name} />
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-semibold sm:text-xl">
              {contact?.name || number || "Unknown number"}
            </h2>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {contact && (
            <Link
              href={`/console/contacts/c-${contact.id}`}
              className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink"
            >
              Open contact
            </Link>
          )}
          <WhatsAppDeleteConversation
            conversationKey={key}
            name={contact?.name || number || "this number"}
            redirectToList
          />
        </div>
      </div>

      {(hasOlder || page > 1) && (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-ink-soft">
          {hasOlder ? (
            <Link
              href={`/console/whatsapp/messages/${key}?page=${page + 1}`}
              className="rounded-full border border-line px-4 py-2 font-medium text-ink transition-colors hover:border-ink"
            >
              ← Older messages
            </Link>
          ) : (
            <span>Start of the conversation</span>
          )}
          {page > 1 && (
            <Link
              href={`/console/whatsapp/messages/${key}${page - 1 > 1 ? `?page=${page - 1}` : ""}`}
              className="rounded-full border border-line px-4 py-2 font-medium text-ink transition-colors hover:border-ink"
            >
              Newer →
            </Link>
          )}
        </div>
      )}
      </div>

      <WhatsAppThread
        conversationKey={key}
        messages={rows}
        page={page}
        now={new Date(now).toISOString()}
        whatsappStatus={contact?.whatsapp_status || "unknown"}
        windowOpen={window.open}
        hasEverReplied={window.lastInboundAt !== null}
      />
    </div>
  );
}
