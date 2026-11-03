"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";

type Submission = { id: number; name: string; email: string; message: string; created_at: string };
type Reply = { id: number; submission_id: number; admin_email: string; message: string; sent_at: string };

type ThreadEvent =
  | { kind: "inbound"; id: number; submissionId: number; name: string; message: string; at: string }
  | { kind: "reply"; id: number; submissionId: number; adminEmail: string; message: string; at: string };

type Thread = {
  email: string;
  name: string;
  events: ThreadEvent[];
  lastActivity: string;
  latestSubmissionId: number;
};

function buildThreads(submissions: Submission[], replies: Reply[]): Thread[] {
  const byEmail = new Map<string, Thread>();
  for (const s of submissions) {
    const key = s.email.trim().toLowerCase();
    const thread = byEmail.get(key) || { email: s.email, name: s.name, events: [], lastActivity: s.created_at, latestSubmissionId: s.id };
    thread.name = s.name || thread.name;
    thread.events.push({ kind: "inbound", id: s.id, submissionId: s.id, name: s.name, message: s.message, at: s.created_at });
    if (s.created_at > thread.lastActivity) thread.lastActivity = s.created_at;
    if (s.id > thread.latestSubmissionId) thread.latestSubmissionId = s.id;
    byEmail.set(key, thread);
  }
  const submissionEmail = new Map(submissions.map((s) => [s.id, s.email.trim().toLowerCase()]));
  for (const r of replies) {
    const key = submissionEmail.get(r.submission_id);
    if (!key) continue;
    const thread = byEmail.get(key);
    if (!thread) continue;
    thread.events.push({ kind: "reply", id: r.id, submissionId: r.submission_id, adminEmail: r.admin_email, message: r.message, at: r.sent_at });
    if (r.sent_at > thread.lastActivity) thread.lastActivity = r.sent_at;
  }
  for (const thread of byEmail.values()) thread.events.sort((a, b) => (a.at < b.at ? -1 : 1));
  return [...byEmail.values()].sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));
}

export default function SupportThreads({ submissions, replies, replyFromEmail }: { submissions: Submission[]; replies: Reply[]; replyFromEmail: string }) {
  const router = useRouter();
  const threads = useMemo(() => buildThreads(submissions, replies), [submissions, replies]);
  const [openEmail, setOpenEmail] = useState<string | null>(threads[0]?.email.trim().toLowerCase() || null);
  const [replyDraft, setReplyDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { confirm, dialog } = useConfirm();

  async function sendReply(submissionId: number) {
    if (!replyDraft.trim()) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/console/support/${submissionId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: replyDraft }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Failed to send reply.");
      return;
    }
    setReplyDraft("");
    router.refresh();
  }

  async function deleteMessage(submissionId: number) {
    if (!(await confirm({ message: "Delete this message and all its replies? This removes it permanently from the database." }))) return;
    setBusy(true);
    const res = await fetch(`/api/console/support/${submissionId}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError("Failed to delete message.");
  }

  if (threads.length === 0) {
    return <p className="text-sm text-ink-soft">No messages yet.</p>;
  }

  return (
    <div className="space-y-4">
      {threads.map((thread) => {
        const key = thread.email.trim().toLowerCase();
        const isOpen = openEmail === key;
        const lastEvent = thread.events[thread.events.length - 1];
        return (
          <div key={key} className="rounded-2xl border border-line bg-paper">
            <button
              type="button"
              onClick={() => setOpenEmail(isOpen ? null : key)}
              className="flex w-full flex-wrap items-center justify-between gap-2 p-6 text-left"
            >
              <div>
                <p className="font-medium">
                  {thread.name} &lt;{thread.email}&gt;
                </p>
                <p className="mt-1 line-clamp-1 text-sm text-ink-soft">
                  {lastEvent.kind === "reply" ? "You: " : ""}
                  {lastEvent.message}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-ink-soft">
                <span>{thread.events.length} message{thread.events.length === 1 ? "" : "s"}</span>
                <span>{new Date(thread.lastActivity).toLocaleString()}</span>
                <span>{isOpen ? "▲" : "▼"}</span>
              </div>
            </button>

            {isOpen && (
              <div className="space-y-4 border-t border-line p-6 pt-4">
                {thread.events.map((event) => (
                  <div
                    key={`${event.kind}-${event.id}`}
                    className={event.kind === "reply" ? "ml-6 rounded-xl bg-paper-soft p-4" : "rounded-xl border border-line p-4"}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-ink-soft">
                        {event.kind === "reply"
                          ? `Sent from ${replyFromEmail}${event.adminEmail ? ` · by ${event.adminEmail}` : ""}`
                          : thread.name}
                      </p>
                      <div className="flex items-center gap-3">
                        <p className="text-xs text-ink-soft">{new Date(event.at).toLocaleString()}</p>
                        {event.kind === "inbound" && (
                          <button
                            type="button"
                            onClick={() => deleteMessage(event.submissionId)}
                            disabled={busy}
                            className="text-xs text-red-700 hover:underline disabled:opacity-50"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{event.message}</p>
                  </div>
                ))}

                <div className="space-y-3">
                  <p className="text-xs text-ink-soft">
                    If they reply to your email, it lands in your own inbox, not here — this dashboard only shows what you send from it.
                  </p>
                  <textarea
                    value={openEmail === key ? replyDraft : ""}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    rows={4}
                    placeholder="Write your reply…"
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                  />
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <button
                    type="button"
                    onClick={() => sendReply(thread.latestSubmissionId)}
                    disabled={busy || !replyDraft.trim()}
                    className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
                  >
                    {busy ? "Sending…" : "Send reply"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {dialog}
    </div>
  );
}
