"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";

type Message = {
  id: number;
  body: string;
  is_question: boolean;
  status: "pending" | "approved" | "rejected";
  parent_comment_id: number | null;
  created_at: string;
  session_start_at: string | null;
  attendee_name: string;
  attendee_email: string;
};

function ReplyForm({ webinarId, questionId, onSent }: { webinarId: number; questionId: number; onSent: (reply: Message) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim()) return;
    setBusy(true); setError("");
    const response = await fetch(`/api/console/webinars/${webinarId}/messages/${questionId}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: value.trim() }) });
    const body = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) return setError(body.error || "Could not send the reply.");
    onSent({ id: body.id, body: value.trim(), is_question: false, status: "approved", parent_comment_id: questionId, created_at: body.created_at, session_start_at: null, attendee_name: "You", attendee_email: "" });
    setValue("");
  }

  return <form onSubmit={submit} className="mt-3 flex flex-wrap items-start gap-2 border-t border-line pt-3">
    <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={2} maxLength={5000} placeholder="Reply to this question..." className="min-w-[220px] flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink" />
    <button type="submit" disabled={busy || !value.trim()} className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-paper disabled:opacity-50">{busy ? "Sending..." : "Reply"}</button>
    {error && <p role="alert" className="w-full text-xs text-red-600">{error}</p>}
  </form>;
}

export default function ConsoleWebinarEngagement({ webinarId, initialMessages }: { webinarId: number; initialMessages: Message[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const occurrences = useMemo(() => [...new Set(messages.map((message) => message.session_start_at).filter((value): value is string => Boolean(value)))], [messages]);
  const [occurrence, setOccurrence] = useState<string>("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const { confirm, dialog } = useConfirm();
  const questions = useMemo(() => messages.filter((message) => message.is_question && (occurrence === "all" || message.session_start_at === occurrence)), [occurrence, messages]);
  const repliesByParent = useMemo(() => {
    const map = new Map<number, Message[]>();
    for (const message of messages) {
      if (message.parent_comment_id === null) continue;
      if (!map.has(message.parent_comment_id)) map.set(message.parent_comment_id, []);
      map.get(message.parent_comment_id)!.push(message);
    }
    return map;
  }, [messages]);

  async function updateStatus(message: Message, status: "approved" | "rejected") {
    setBusyId(message.id); setError("");
    const response = await fetch(`/api/console/webinars/${webinarId}/messages/${message.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const body = await response.json().catch(() => ({})); setBusyId(null);
    if (!response.ok) return setError(body.error || "Could not update the message.");
    setMessages((current) => current.map((item) => item.id === message.id ? { ...item, status } : item));
  }

  async function remove(message: Message) {
    const approved = await confirm({ message: "Permanently remove this message and any replies from the webinar room?", confirmLabel: "Remove message" });
    if (!approved) return;
    setBusyId(message.id); setError("");
    const response = await fetch(`/api/console/webinars/${webinarId}/messages/${message.id}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({})); setBusyId(null);
    if (!response.ok) return setError(body.error || "Could not remove the message.");
    setMessages((current) => current.filter((item) => item.id !== message.id && item.parent_comment_id !== message.id));
  }

  return <div className="mt-7">
    <div className="flex flex-wrap gap-2"><button onClick={() => setOccurrence("all")} className={`rounded-full border px-4 py-2 text-sm ${occurrence === "all" ? "border-ink bg-ink text-paper" : "border-line bg-paper"}`}>All broadcasts</button>{occurrences.map((value) => <button key={value} onClick={() => setOccurrence(value)} className={`rounded-full border px-4 py-2 text-sm ${occurrence === value ? "border-ink bg-ink text-paper" : "border-line bg-paper"}`}>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))}</button>)}</div>
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-600 p-3 text-sm text-red-600">{error}</p>}
    <div className="mt-5 space-y-3">{questions.map((message) => {
      const replies = repliesByParent.get(message.id) || [];
      return <article key={message.id} className="rounded-2xl border border-line bg-paper p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{message.attendee_name}</strong><span className="text-xs text-ink-soft">{message.attendee_email}</span><span className="rounded-full bg-paper-soft px-2 py-1 text-[10px] font-medium uppercase tracking-wide">Question</span><span className="text-[10px] uppercase tracking-wide text-ink-soft">{message.status}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{message.body}</p><p className="mt-3 text-xs text-ink-soft">Broadcast: {message.session_start_at ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(message.session_start_at)) : "Legacy question"}</p></div>
        <div className="flex flex-wrap gap-2"><button disabled={busyId === message.id || message.status === "approved"} onClick={() => updateStatus(message, "approved")} className="rounded-full border border-line px-3 py-1.5 text-xs disabled:opacity-40">Approve</button><button disabled={busyId === message.id || message.status === "rejected"} onClick={() => updateStatus(message, "rejected")} className="rounded-full border border-line px-3 py-1.5 text-xs disabled:opacity-40">Hide</button><button disabled={busyId === message.id} onClick={() => remove(message)} className="rounded-full border border-line px-3 py-1.5 text-xs text-red-600 disabled:opacity-40">Delete</button></div></div>
        {replies.length > 0 && <div className="mt-4 space-y-2 border-t border-line pt-3">{replies.map((reply) => <div key={reply.id} className="ml-4 rounded-xl bg-paper-soft p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">Your reply</span><button disabled={busyId === reply.id} onClick={() => remove(reply)} className="text-[11px] text-red-600 disabled:opacity-40">Delete</button></div><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{reply.body}</p></div>)}</div>}
        <ReplyForm webinarId={webinarId} questionId={message.id} onSent={(reply) => setMessages((current) => [...current, reply])} />
      </article>;
    })}{!questions.length && <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">No messages in this view yet.</p>}</div>{dialog}
  </div>;
}
