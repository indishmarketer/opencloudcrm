"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";
import { formatMessageClock, formatMessageDay, messageDayKey } from "@/lib/whatsappFormat";

export type ThreadMessage = {
  id: number;
  direction: string;
  body: string | null;
  /** Where the browser loads the file from: the console's own
   * authenticated route for anything in the private bucket, a public URL
   * for a template's sample and for files stored before it existed. */
  media_src: string | null;
  media_kind: "image" | "video" | "audio" | "file" | null;
  /** The file belongs to this message alone, so it can be deleted. A
   * template's header image is shown the same way but belongs to the
   * template, not to this message. */
  media_stored: boolean;
  status: string | null;
  error: string | null;
  created_at: string;
};

/** Anything that is not a picture or a video gets a player or a link rather
 * than being forced into an <img>, which is what a voice note or a PDF used
 * to become: a permanently broken image icon. Which it is comes from the
 * server, because the console's own media URL carries no file extension to
 * work it out from. */
const MEDIA_NOUN: Record<string, string> = {
  image: "photo",
  video: "video",
  audio: "voice message",
  file: "file",
};

/** Delivery state as WhatsApp itself draws it: one tick sent, two ticks
 * delivered, two green ticks read. The words were accurate but needed
 * reading; these are the same shapes the person on the other end sees. */
function StatusTicks({ status }: { status: string | null }) {
  if (!status || status === "failed") return null;
  const double = status === "delivered" || status === "read";
  const read = status === "read";

  return (
    <span
      className={`inline-flex items-center ${read ? "text-green-400" : "text-paper/70"}`}
      role="img"
      aria-label={read ? "Read" : double ? "Delivered" : "Sent"}
      title={read ? "Read" : double ? "Delivered" : "Sent"}
    >
      <svg viewBox="0 0 18 12" className={double ? "h-3 w-[1.15rem]" : "h-3 w-3"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M1 6.5 4.5 10 11 2" />
        {double && <path d="M7 10 13.5 2" />}
      </svg>
    </span>
  );
}

/** A WhatsApp conversation, laid out like a chat: their messages on the
 * left, ours on the right, oldest first, grouped under the day they were
 * sent, with the reply box underneath. */
export default function WhatsAppThread({
  conversationKey,
  messages: initialMessages,
  page = 1,
  now,
  whatsappStatus,
  windowOpen: initialWindowOpen,
  hasEverReplied,
}: {
  conversationKey: string;
  messages: ThreadMessage[];
  /** Which slice of the thread is on screen; only the newest one polls. */
  page?: number;
  /** The database request time, so "Today" does not depend on the reader's
   * own clock and does not have to be read during render. */
  now: string;
  whatsappStatus: string;
  windowOpen: boolean;
  hasEverReplied: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [windowOpen, setWindowOpen] = useState(initialWindowOpen);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const lastId = messages[messages.length - 1]?.id ?? 0;

  useEffect(() => {
    if (!expandedImage) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedImage(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [expandedImage]);

  // Reading the thread is what clears its unread count in the inbox. Sent
  // from here rather than written while the page renders, because the
  // conversation list links to this page and a prefetched link would mark
  // it read without anyone having opened it.
  useEffect(() => {
    fetch(`/api/console/whatsapp/conversations/${conversationKey}/read`, { method: "POST" }).catch(() => {});
  }, [conversationKey, messages.length]);

  // Start at the latest message, then follow new activity only while the
  // reader is already near the bottom of the message list.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (isAtBottomRef.current) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [lastId]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/console/whatsapp/conversations/${conversationKey}/messages?page=${page}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as { messages: ThreadMessage[]; windowOpen: boolean };
      // Replaced wholesale rather than appended: a message that was "sent"
      // a minute ago is "read" now, and those ticks are most of the point.
      setMessages(data.messages);
      setWindowOpen(data.windowOpen);
    } catch {
      // A failed poll is not worth showing: the next one is five seconds
      // away and the thread on screen is still perfectly readable.
    }
  }, [conversationKey, page]);

  // Their replies and our delivery ticks arrive on their own, the way a
  // chat is supposed to work. Only while the tab is actually being looked
  // at, so a console left open overnight is not polling all night.
  useEffect(() => {
    if (page !== 1) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, page]);

  const optedOut = whatsappStatus === "unsubscribed";
  // Meta caps a media caption at 1,024 characters while a plain text message
  // can run to 4,000, so attaching a file to an already-long message would
  // be refused by the API with nothing on screen explaining it.
  const captionLimit = 1024;
  const tooLongForCaption = Boolean(attachment) && body.length > captionLimit;

  async function send() {
    if (sending || tooLongForCaption || (!body.trim() && !attachment)) return;
    setSending(true);
    setError("");
    try {
      const form = new FormData();
      form.set("body", body);
      if (attachment) form.set("image", attachment);
      const res = await fetch(`/api/console/whatsapp/conversations/${conversationKey}`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send that message.");
      setBody("");
      setAttachment(null);
      await refresh();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send that message.");
    } finally {
      setSending(false);
    }
  }

  async function deleteMedia(message: ThreadMessage) {
    const kind = MEDIA_NOUN[message.media_kind || "file"];
    const ok = await confirm({
      message: `Delete this ${kind} from storage for good? The message stays in the conversation, but the file goes and cannot be recovered. Their own copy on WhatsApp is not affected.`,
      confirmLabel: "Delete file",
    });
    if (!ok) return;
    setRemoving(message.id);
    setError("");
    const res = await fetch(`/api/console/whatsapp/messages/${message.id}/media`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setRemoving(0);
    if (!res.ok) {
      setError(data.error || "Could not delete that file.");
      return;
    }
    await refresh();
    router.refresh();
  }

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col">
      {dialog}
      {expandedImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded WhatsApp image"
          onClick={() => setExpandedImage(null)}
        >
          <button
            type="button"
            onClick={() => setExpandedImage(null)}
            aria-label="Close expanded image"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={expandedImage}
            alt="Expanded WhatsApp image attachment"
            onClick={(event) => event.stopPropagation()}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      )}
      <div
        ref={listRef}
        onScroll={(event) => {
          const list = event.currentTarget;
          isAtBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
        }}
        className="whatsapp-wallpaper min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain rounded-2xl border border-line p-3 sm:p-5"
      >
        {messages.map((message, index) => {
          const inbound = message.direction === "inbound";
          // One separator per calendar day, the way a chat app does it, so
          // the bubbles themselves only have to carry a time.
          const newDay = index === 0 || messageDayKey(message.created_at) !== messageDayKey(messages[index - 1].created_at);

          return (
            <div key={message.id}>
              {newDay && (
                <div className="flex justify-center py-3">
                  <span className="rounded-full bg-paper px-3 py-1 text-xs font-medium text-ink-soft shadow-sm">
                    {formatMessageDay(message.created_at, now)}
                  </span>
                </div>
              )}
              <div
                className={`w-fit max-w-[85%] rounded-2xl px-3 py-2 text-sm sm:max-w-[80%] sm:px-4 sm:py-2.5 ${
                  inbound ? "bg-paper" : "ml-auto bg-ink text-paper"
                }`}
              >
                {message.media_src && (
                  <div className="mb-2">
                    {message.media_kind === "video" ? (
                      <video src={message.media_src} controls className="max-h-56 w-full max-w-full rounded-lg sm:max-w-[18rem]" />
                    ) : message.media_kind === "image" ? (
                      <button
                        type="button"
                        onClick={() => setExpandedImage(message.media_src!)}
                        aria-label="Open image attachment"
                        className="block max-w-full cursor-zoom-in overflow-hidden rounded-lg"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={message.media_src}
                          alt="WhatsApp image attachment"
                          className="max-h-48 max-w-full rounded-lg object-contain sm:max-w-[15rem]"
                        />
                      </button>
                    ) : message.media_kind === "audio" ? (
                      <audio src={message.media_src} controls className="w-full max-w-xs" />
                    ) : (
                      <a
                        href={message.media_src}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-block rounded-lg px-3 py-2 text-sm underline ${inbound ? "bg-paper-soft" : "bg-paper/10"}`}
                      >
                        Open attachment
                      </a>
                    )}
                    {message.media_stored && (
                      <button
                        type="button"
                        disabled={removing === message.id}
                        onClick={() => deleteMedia(message)}
                        className={`mt-1.5 text-xs underline underline-offset-2 transition-opacity hover:opacity-70 disabled:opacity-50 ${
                          inbound ? "text-ink-soft" : "text-paper/70"
                        }`}
                      >
                        {removing === message.id ? "Deleting…" : "Delete file from storage"}
                      </button>
                    )}
                  </div>
                )}
                {message.body ? (
                  <p className="whitespace-pre-wrap">{message.body}</p>
                ) : (
                  !message.media_src && (
                    <p className={`italic ${inbound ? "text-ink-soft" : "text-paper/70"}`}>No text recorded</p>
                  )
                )}
                <p className={`mt-1 flex items-center justify-end gap-1.5 text-xs ${inbound ? "text-ink-soft" : "text-paper/70"}`}>
                  <span>{formatMessageClock(message.created_at)}</span>
                  {!inbound && <StatusTicks status={message.status} />}
                  {!inbound && message.status === "failed" && <span className="font-medium text-red-300">Failed</span>}
                </p>
                {message.error && (
                  <p className={`mt-1 text-xs ${inbound ? "text-red-600" : "text-red-300"}`}>{message.error}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {optedOut ? (
        <p className="mt-4 rounded-xl border border-line bg-paper p-4 text-sm text-red-600">
          They sent STOP, so nothing more can be sent on WhatsApp unless they opt back in.
        </p>
      ) : windowOpen ? (
        <div className="mt-3 shrink-0">
          <div className="relative">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
              maxLength={4000}
              rows={composerExpanded ? 8 : 2}
              placeholder="Reply on WhatsApp…"
              className={`w-full rounded-lg border border-line bg-paper px-4 py-3 pb-12 text-sm outline-none focus:border-ink ${
                composerExpanded ? "h-64 resize-y" : "h-24 resize-none"
              }`}
            />
            <label
              title="Attach a photo or video"
              aria-label="Attach a photo or video"
              className="absolute bottom-2.5 left-2.5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-paper-soft hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m8.5 12.5 6.8-6.8a3.2 3.2 0 0 1 4.5 4.5l-8.7 8.7a5 5 0 0 1-7.1-7.1l8.6-8.6" />
              </svg>
              <input
                type="file"
                accept="image/jpeg,image/png,video/mp4"
                className="sr-only"
                onChange={(e) => setAttachment(e.target.files?.[0] || null)}
              />
            </label>
            <button
              type="button"
              onClick={() => setComposerExpanded((value) => !value)}
              aria-label={composerExpanded ? "Shrink reply box" : "Expand reply box"}
              title={composerExpanded ? "Shrink reply box" : "Expand reply box"}
              className="absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-paper-soft hover:text-ink"
            >
              {composerExpanded ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 3v5H3M16 3v5h5M3 16h5v5M21 16h-5v5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" />
                </svg>
              )}
            </button>
            {attachment && <span className="absolute bottom-3 left-14 flex max-w-[70%] items-center gap-2 truncate rounded-full bg-paper-soft px-3 py-1 text-xs text-ink-soft">
              <span className="truncate">{attachment.name}</span>
              <button type="button" aria-label="Remove attachment" onClick={() => setAttachment(null)} className="font-semibold text-ink">×</button>
            </span>}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className={`text-xs ${tooLongForCaption ? "text-red-600" : "text-ink-soft"}`}>
              {tooLongForCaption
                ? `A caption on a file can be ${captionLimit} characters at most. Shorten it by ${body.length - captionLimit} or send the text on its own.`
                : "Free-form replies are allowed for 24 hours after their last message."}
            </p>
            <button
              type="button"
              onClick={send}
              disabled={sending || tooLongForCaption || (!body.trim() && !attachment)}
              className="shrink-0 rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-line bg-paper p-4 text-sm text-ink-soft">
          {hasEverReplied
            ? "The 24-hour reply window has closed. WhatsApp only allows a free-form reply within 24 hours of their last message, so this needs an approved template."
            : "They have never messaged us, so there is no reply window open. Only an approved template can start a conversation."}
        </p>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
