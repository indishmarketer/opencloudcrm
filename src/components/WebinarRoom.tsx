"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MuxPlayer from "@/components/MuxPlayer";
import { timeAgo } from "@/lib/timeAgo";
import { useConfirm } from "@/components/ConfirmDialog";
import { webinarSessionState } from "@/lib/webinarSession";

type Message = { id: number; user_id: number; parent_comment_id: number | null; body: string; is_question: boolean; status: string; created_at: string; author_name: string | null; author_username: string | null };
type TimedEvent = { id: number; event_type: "quiz" | "cta" | "question"; trigger_seconds: number; title: string; body: string | null; options: string[]; correct_option: number | null; cta_label: string | null; cta_url: string | null; response_type: "choice" | "text" | null; display_mode: "popup" | "qa" | "both"; selected_option: number | null; response_text: string | null };
type Tab = "questions" | "resources";

function isAnswered(item: TimedEvent): boolean {
  return item.event_type !== "cta" && (item.selected_option !== null || item.response_text !== null);
}

function countdown(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60), remaining = seconds % 60;
  return `${days ? `${days}d ` : ""}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function sessionWindow(startAt: string | null, durationSeconds: number | null, timeZone: string) {
  if (!startAt || !durationSeconds) return null;
  const start = new Date(startAt), end = new Date(start.getTime() + durationSeconds * 1000);
  const date = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone }).format(start);
  const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" });
  return `${date}, ${time.format(start)} to ${time.format(end)}`;
}

export default function WebinarRoom(props: {
  webinarId: number; slug: string; title: string; playbackId: string; presenterName: string | null; ctaLabel: string | null; ctaUrl: string | null; viewerName: string;
  sessionStartAt: string | null; sessionTimeZone: string; serverNow: number; durationSeconds: number | null; timedEvents: TimedEvent[];
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleLeave(watchSeconds = 0) {
    if (await confirm({ message: "Do you want to leave the webinar? The presentation will continue while you are away.", confirmLabel: "Leave room" })) {
      void fetch("/api/webinars/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ webinarId: props.webinarId, watchSeconds, left: true }), keepalive: true }).catch(() => undefined);
      router.replace(`/webinars/${props.slug}?left=1`);
      router.refresh();
    }
  }

  const scheduledTime = props.sessionStartAt ? new Date(props.sessionStartAt).getTime() : null;
  const [now, setNow] = useState(props.serverNow);
  useEffect(() => {
    if (!scheduledTime) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [scheduledTime]);
  const sessionState = props.sessionStartAt && props.durationSeconds ? webinarSessionState(props.sessionStartAt, props.durationSeconds, now) : null;
  const ended = sessionState?.phase === "ended";
  const broadcastWindow = sessionWindow(props.sessionStartAt, props.durationSeconds, props.sessionTimeZone);
  useEffect(() => {
    if (!ended) return;
    void fetch("/api/webinars/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ webinarId: props.webinarId, watchSeconds: 0, completed: true }), keepalive: true });
  }, [ended, props.webinarId]);
  if (scheduledTime && now < scheduledTime) return <div className="fixed inset-0 z-[100] flex h-dvh flex-col bg-ink text-paper">{dialog}<header className="flex h-16 items-center justify-between border-b border-paper/15 px-6"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-paper/60">Your seat is reserved</p><h1 className="mt-1 text-sm font-semibold">{props.title}</h1></div><button type="button" onClick={() => handleLeave()} className="rounded-full border border-red-600 bg-red-600/10 px-4 py-2 text-xs font-medium text-red-500 hover:bg-red-600 hover:text-white">Leave room</button></header><main className="flex flex-1 items-center justify-center px-6 text-center"><div className="max-w-xl"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-paper/30 text-xl">●</span><p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-paper/60">Webinar starts in</p><p className="mt-3 font-display text-5xl font-semibold tabular-nums sm:text-7xl">{countdown(scheduledTime - now)}</p><p className="mt-6 text-sm leading-6 text-paper/65">Keep this page open. The presentation and room conversation will start automatically.</p><p className="mt-3 text-xs text-paper/45">{new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short" }).format(new Date(scheduledTime))}</p></div></main></div>;
  if (ended) return <div className="fixed inset-0 z-[100] flex h-dvh items-center justify-center bg-ink px-6 text-center text-paper"><div className="max-w-lg"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-paper/55">Session complete</p><h1 className="mt-3 font-display text-4xl font-semibold">Thank you for joining</h1><p className="mt-4 text-sm leading-6 text-paper/65">This webinar followed a live timeline and has now ended. Resources and next steps remain available on the webinar page.</p><button type="button" onClick={() => router.replace(`/webinars/${props.slug}?left=1`)} className="mt-7 rounded-full bg-paper px-6 py-3 text-sm font-semibold text-ink">Return to webinar page</button></div></div>;
  const liveTime = sessionState?.elapsedSeconds || 0;
  return <><ActiveWebinarRoom {...props} liveTime={liveTime} onLeave={handleLeave} />{broadcastWindow && <div className="fixed bottom-3 left-3 z-[120] rounded-lg border border-paper/20 bg-ink/90 px-3 py-2 text-[11px] text-paper/70">Broadcast: {broadcastWindow}</div>}{dialog}</>;
}

function ActiveWebinarRoom({ webinarId, title, playbackId, presenterName, ctaLabel, ctaUrl, viewerName, sessionStartAt, serverNow, durationSeconds, timedEvents, liveTime, onLeave }: {
  webinarId: number; slug: string; title: string; playbackId: string; presenterName: string | null; ctaLabel: string | null; ctaUrl: string | null; viewerName: string;
  sessionStartAt: string | null; sessionTimeZone: string; serverNow: number; durationSeconds: number | null; timedEvents: TimedEvent[];
  liveTime: number; onLeave: (watchSeconds?: number) => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("questions"), [messages, setMessages] = useState<Message[]>([]), [loading, setLoading] = useState(true), [sending, setSending] = useState(false), [error, setError] = useState("");
  const attendedSeconds = useRef(0);
  useEffect(() => {
    const report = () => void fetch("/api/webinars/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ webinarId, watchSeconds: attendedSeconds.current }), keepalive: true });
    const timer = window.setInterval(() => { attendedSeconds.current += 1; if (attendedSeconds.current % 15 === 0) report(); }, 1000);
    return () => { window.clearInterval(timer); report(); };
  }, [webinarId]);

  const initialOffset = sessionStartAt ? Math.max(0, Math.floor((serverNow - new Date(sessionStartAt).getTime()) / 1000)) : 0;
  const safeOffset = durationSeconds && initialOffset >= durationSeconds ? 0 : initialOffset;
  const [popupQueue, setPopupQueue] = useState<TimedEvent[]>([]);
  // Timed interactions (quiz/question/cta) whose display_mode puts them in
  // the Q&A sidebar rather than only as a popup -- carries the moment it
  // became due so it can interleave chronologically with real attendee
  // messages below.
  const [dueEvents, setDueEvents] = useState<Array<TimedEvent & { dueAt: number }>>([]);
  const [answers, setAnswers] = useState<Record<number, { selected: number | null; text: string | null; correct: boolean | null }>>(() => Object.fromEntries(
    timedEvents.filter((item) => item.selected_option !== null || item.response_text !== null).map((item) => [item.id, {
      selected: item.selected_option,
      text: item.response_text,
      correct: item.correct_option === null || item.selected_option === null ? null : Number(item.selected_option) === Number(item.correct_option),
    }]),
  ));
  const seen = useRef(new Set<number>());
  const loadMessages = useCallback(async () => { const response = await fetch(`/api/webinar-comments?webinarId=${webinarId}`, { cache: "no-store" }); if (!response.ok) return; const body = await response.json().catch(() => ({})); setMessages(body.comments || []); setLoading(false); }, [webinarId]);
  useEffect(() => { const initial = window.setTimeout(() => void loadMessages(), 0), timer = window.setInterval(() => void loadMessages(), 5000); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [loadMessages]);
  const onVideoTime = useCallback((seconds: number) => {
    const due = timedEvents.filter((item) => item.trigger_seconds <= seconds && !seen.current.has(item.id));
    if (!due.length) return;
    due.forEach((item) => seen.current.add(item.id));
    const popups = due.filter((item) => (item.display_mode === "popup" || item.display_mode === "both") && !isAnswered(item));
    if (popups.length) setPopupQueue((current) => [...current, ...popups]);
    const sidebarEvents = due.filter((item) => item.display_mode === "qa" || item.display_mode === "both");
    if (sidebarEvents.length) { const now = Date.now(); setDueEvents((current) => [...current, ...sidebarEvents.map((item) => ({ ...item, dueAt: now }))]); }
  }, [timedEvents]);
  const questions = useMemo(() => messages.filter((message) => message.is_question), [messages]);
  const popup = popupQueue[0] || null;
  async function send(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget, bodyText = String(new FormData(form).get("body") || "").trim(); if (!bodyText) return; setSending(true); setError(""); const response = await fetch("/api/webinar-comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ webinarId, body: bodyText }) }); const responseBody = await response.json().catch(() => ({})); setSending(false); if (!response.ok) return setError(responseBody.error || "Your question could not be sent."); form.reset(); await loadMessages(); }
  async function submitAnswer(item: TimedEvent, payload: { selected?: number; text?: string }) {
    setError("");
    const body = payload.selected !== undefined ? { selectedOption: payload.selected } : { responseText: payload.text };
    const response = await fetch(`/api/webinars/quiz/${item.id}/answer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) { setError(responseBody.error || "Your answer could not be saved."); return; }
    setAnswers((current) => ({ ...current, [item.id]: { selected: payload.selected ?? null, text: payload.text ?? null, correct: responseBody.isCorrect ?? null } }));
  }
  // Merges attendee messages/replies with any due host interactions
  // (questions/quizzes/CTAs shown in the sidebar) into one chronological feed.
  const feed = useMemo(() => {
    const items: Array<{ at: number; key: string; node: React.ReactNode }> = [];
    for (const message of messages) items.push({ at: new Date(message.created_at).getTime(), key: `m-${message.id}`, node: <AttendeeMessage key={`m-${message.id}`} message={message} questionMode /> });
    for (const event of dueEvents) {
      const answered = Boolean(answers[event.id]);
      items.push({ at: event.dueAt, key: `e-${event.id}`, node: <HostEvent key={`e-${event.id}`} item={event} presenterName={presenterName} answered={answered} onOpen={() => setPopupQueue((current) => current.some((p) => p.id === event.id) ? current : [event, ...current])} /> });
    }
    return items.sort((a, b) => a.at - b.at);
  }, [messages, dueEvents, answers, presenterName]);
  const tabs: Array<{ key: Tab; label: string; count?: number }> = [{ key: "questions", label: "Q&A", count: questions.length }, { key: "resources", label: "Resources" }];
  return <div className="fixed inset-0 z-[100] flex h-dvh flex-col bg-ink text-paper"><header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-paper/15 px-4 sm:px-6"><div className="min-w-0"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-paper" aria-hidden="true" /><span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-paper/60">Session in progress</span></div><h1 className="mt-1 truncate text-sm font-semibold sm:text-base">{title}</h1></div><div className="flex items-center gap-3"><span className="hidden text-xs text-paper/60 sm:inline">Signed in as {viewerName}</span><button type="button" onClick={() => onLeave(attendedSeconds.current)} className="rounded-full border border-red-600 bg-red-600/10 px-4 py-2 text-xs font-medium text-red-500 hover:bg-red-600 hover:text-white">Leave room</button></div></header>
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_390px]"><main className="flex min-h-[45vh] items-center justify-center overflow-auto bg-black p-3 sm:p-6 lg:min-h-0"><div className="relative w-full max-w-[1500px] overflow-hidden rounded-xl border border-paper/10 bg-black shadow-2xl"><MuxPlayer playbackId={playbackId} title={title} autoPlay startTime={safeOffset} lockedTime={sessionStartAt ? liveTime : undefined} onTimeUpdate={onVideoTime} />{popup && <InteractionPopup item={popup} answer={answers[popup.id]} onSubmit={(payload) => submitAnswer(popup, payload)} onClose={() => setPopupQueue((current) => current.slice(1))} />}</div></main>
      <aside className="flex min-h-0 flex-col border-t border-paper/15 bg-paper text-ink lg:border-l lg:border-t-0"><div className="grid grid-cols-3 border-b border-line" role="tablist" aria-label="Webinar room panels">{tabs.map((item) => <button type="button" role="tab" aria-selected={tab === item.key} key={item.key} onClick={() => setTab(item.key)} className={`border-b-2 px-2 py-4 text-xs font-semibold ${tab === item.key ? "border-ink text-ink" : "border-transparent text-ink-soft"}`}>{item.label}{item.count ? ` ${item.count}` : ""}</button>)}</div>
        {tab === "resources" ? <Resources ctaLabel={ctaLabel} ctaUrl={ctaUrl} presenterName={presenterName} /> : <><div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite"><div className="rounded-xl border border-ink bg-ink p-3 text-paper"><p className="text-xs font-semibold">Questions for the host</p><p className="mt-1 text-xs leading-5 text-paper/65">Ask a question about this broadcast. Attendee questions are private to their own broadcast occurrence and reviewed by the host.</p></div>{loading && <p className="text-center text-sm text-ink-soft">Loading questions...</p>}{!loading && feed.length === 0 && <div className="mx-auto mt-10 max-w-xs text-center"><p className="font-semibold">Ask the first question</p><p className="mt-2 text-sm leading-6 text-ink-soft">Questions stay linked to your account so the host can follow up.</p></div>}{feed.map((item) => item.node)}</div><form onSubmit={send} className="border-t border-ink bg-paper-soft p-4"><label htmlFor="webinar-room-message" className="sr-only">Ask a question</label><textarea id="webinar-room-message" name="body" required maxLength={5000} rows={2} placeholder="Ask the host a question..." className="w-full resize-none rounded-xl border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink" />{error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}<div className="mt-2 flex items-center justify-between gap-3"><span className="text-[11px] text-ink-soft">Posted as {viewerName}</span><button type="submit" disabled={sending} className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-paper disabled:opacity-50">{sending ? "Sending..." : "Submit question"}</button></div></form></>}
      </aside></div></div>;
}

function InteractionPopup({ item, answer, onSubmit, onClose }: { item: TimedEvent; answer?: { selected: number | null; text: string | null; correct: boolean | null }; onSubmit: (payload: { selected?: number; text?: string }) => void; onClose: () => void }) {
  const [draft, setDraft] = useState("");
  const isQuiz = item.event_type === "quiz";
  const isChoice = isQuiz || (item.event_type === "question" && item.response_type === "choice");
  const isText = item.event_type === "question" && item.response_type === "text";
  const eyebrow = isQuiz ? "Live quiz" : item.event_type === "question" ? "Quick question" : "From your host";
  return <div className="absolute inset-x-4 bottom-4 z-20 mx-auto max-w-xl rounded-2xl border-2 border-red-600 bg-ink/95 p-5 text-paper shadow-2xl backdrop-blur">
    <button onClick={onClose} className="absolute right-4 top-3 text-xl text-paper/60" aria-label="Close interaction">×</button>
    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-500">{eyebrow}</p>
    <h2 className="mt-2 pr-8 font-display text-2xl font-semibold">{item.title}</h2>
    {item.body && <p className="mt-2 text-sm leading-6 text-paper/70">{item.body}</p>}
    {isChoice ? <div className="mt-4 grid gap-2">
        {item.options.map((option, index) => <button key={option} disabled={Boolean(answer)} onClick={() => onSubmit({ selected: index })} className={`rounded-xl border px-4 py-3 text-left text-sm ${answer?.selected === index ? "border-paper bg-paper text-ink" : "border-paper/20 hover:border-paper/50"}`}>{option}</button>)}
        {answer && <p className="mt-2 text-sm font-medium">{isQuiz ? (answer.correct === null ? "Answer saved." : answer.correct ? "Correct. Nicely done." : "Answer saved. Keep watching for the explanation.") : "Response saved. Thanks for sharing."}</p>}
      </div>
      : isText ? (answer?.text ? <p className="mt-4 rounded-xl border border-paper/20 bg-paper/10 px-4 py-3 text-sm">{answer.text}</p> : <form onSubmit={(event) => { event.preventDefault(); if (draft.trim()) onSubmit({ text: draft.trim() }); }} className="mt-4">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} maxLength={2000} placeholder="Type your answer..." className="w-full resize-none rounded-xl border border-paper/20 bg-paper/10 px-3 py-2.5 text-sm text-paper placeholder:text-paper/40 outline-none focus:border-paper/50" />
          <button type="submit" disabled={!draft.trim()} className="mt-2 rounded-full bg-paper px-5 py-2.5 text-sm font-semibold text-ink disabled:opacity-50">Send answer</button>
        </form>)
      : item.cta_url && item.cta_label ? <Link href={item.cta_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-full bg-red-600 px-5 py-3 text-sm font-semibold text-paper">{item.cta_label}</Link> : null}
  </div>;
}
function Resources({ ctaLabel, ctaUrl, presenterName }: { ctaLabel: string | null; ctaUrl: string | null; presenterName: string | null }) { return <div className="flex-1 overflow-y-auto p-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">Session resources</p>{ctaLabel && ctaUrl ? <div className="mt-5 rounded-2xl border border-line p-5"><h2 className="font-display text-xl font-semibold">Ready for the next step?</h2><p className="mt-2 text-sm leading-6 text-ink-soft">Use this resource whenever you are ready during the presentation.</p><Link href={ctaUrl} className="mt-5 inline-flex w-full justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper">{ctaLabel}</Link></div> : <p className="mt-5 text-sm leading-6 text-ink-soft">Resources shared by the host will appear here.</p>}{presenterName && <div className="mt-5 rounded-2xl bg-paper-soft p-4"><p className="text-xs text-ink-soft">Hosted by</p><p className="mt-1 text-sm font-semibold">{presenterName}</p></div>}</div>; }
function AttendeeMessage({ message, questionMode }: { message: Message; questionMode: boolean }) { const isReply = Boolean(message.parent_comment_id); const label = isReply ? "Host" : message.author_name || message.author_username || "Attendee"; return <article className={`${isReply ? "ml-6" : ""} ${questionMode ? "rounded-xl border border-line p-3" : ""}`}><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-paper">{label.slice(0, 1).toUpperCase()}</span><span className="text-xs font-semibold">{label}</span>{message.is_question && <span className="rounded-full bg-ink px-2 py-0.5 text-[9px] font-semibold uppercase text-paper">Question</span>}{isReply && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[9px] font-semibold uppercase text-paper">Answer</span>}<span className="text-[11px] text-ink-soft">{timeAgo(message.created_at)}</span></div><p className="ml-9 mt-1 whitespace-pre-wrap text-sm leading-6">{message.body}</p></article>; }
function HostEvent({ item, presenterName, answered, onOpen }: { item: TimedEvent; presenterName: string | null; answered: boolean; onOpen: () => void }) { return <article className="rounded-xl bg-paper-soft p-3"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-paper">{(presenterName || "H").slice(0, 1)}</span><span className="text-xs font-semibold">{presenterName || "Host"}</span><span className="rounded-full bg-ink px-2 py-0.5 text-[9px] font-semibold uppercase text-paper">Host</span></div><p className="ml-9 mt-2 text-sm font-semibold">{item.title}</p>{item.body && <p className="ml-9 mt-1 text-sm leading-6 text-ink-soft">{item.body}</p>}<div className="ml-9 mt-3">{item.event_type === "cta" && item.cta_url && item.cta_label ? <Link href={item.cta_url} target="_blank" rel="noreferrer" className="inline-flex rounded-full bg-ink px-4 py-2 text-xs font-semibold text-paper">{item.cta_label}</Link> : <button onClick={onOpen} className="rounded-full border border-line bg-paper px-4 py-2 text-xs font-semibold">{answered ? "View answer" : item.event_type === "quiz" ? "Answer quiz" : "Answer"}</button>}</div></article>; }
