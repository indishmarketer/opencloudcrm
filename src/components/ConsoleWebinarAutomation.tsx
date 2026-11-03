"use client";

import { useState } from "react";
import BrandSelect from "@/components/BrandSelect";
import { useConfirm } from "@/components/ConfirmDialog";
import { webinarAutomationPayload } from "@/lib/webinarAutomationSchema";
import { SITE_URL } from "@/config/brand";

type Schedule = { id?: number; schedule_kind: "weekly" | "specific"; timezone: string; weekdays: number[]; specific_date: string | null; local_time: string; active: boolean };
type TimedEvent = { id?: number; event_type: "quiz" | "cta" | "question"; trigger_seconds: number; title: string; body: string | null; options: string[]; correct_option: number | null; cta_label: string | null; cta_url: string | null; response_type: "choice" | "text" | null; display_mode: "popup" | "qa" | "both"; active: boolean };

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const timezones = [
  { value: "Asia/Kolkata", label: "India (Asia/Kolkata)" }, { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "New York" }, { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "Europe/London", label: "London" }, { value: "Europe/Berlin", label: "Berlin" },
  { value: "Asia/Dubai", label: "Dubai" }, { value: "Asia/Singapore", label: "Singapore" }, { value: "Australia/Sydney", label: "Sydney" },
];
const inputClass = "w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink";
const buttonClass = "rounded-full border border-line bg-paper px-4 py-2 text-sm font-medium disabled:opacity-40";
const newWeekly = (): Schedule => ({ schedule_kind: "weekly", timezone: "Asia/Kolkata", weekdays: [2], specific_date: null, local_time: "18:30", active: true });
const newSpecific = (): Schedule => ({ schedule_kind: "specific", timezone: "Asia/Kolkata", weekdays: [], specific_date: new Date().toISOString().slice(0, 10), local_time: "18:30", active: true });
const newEvent = (event_type: "quiz" | "cta" | "question"): TimedEvent => ({
  event_type,
  trigger_seconds: 0,
  title: event_type === "quiz" ? "Quick quiz" : event_type === "question" ? "Do you agree?" : "Ready for the next step?",
  body: null,
  options: event_type === "quiz" ? ["Answer one", "Answer two"] : event_type === "question" ? ["Yes", "No"] : [],
  correct_option: event_type === "quiz" ? 0 : null,
  cta_label: event_type === "cta" ? "Learn more" : null,
  cta_url: event_type === "cta" ? `${SITE_URL}/contact` : null,
  response_type: event_type === "question" ? "choice" : null,
  display_mode: "both",
  active: true,
});
function timestamp(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
function parseTimestamp(value: string) { const match = value.trim().match(/^(\d{1,3}):(\d{2})$/); return match ? Number(match[1]) * 60 + Math.min(59, Number(match[2])) : 0; }
function scheduleWindow(localTime: string, durationSeconds: number | null) {
  if (!durationSeconds) return `${localTime.slice(0, 5)} to pending video duration`;
  const [hour, minute] = localTime.slice(0, 5).split(":").map(Number);
  const endMinutes = hour * 60 + minute + Math.ceil(durationSeconds / 60);
  const end = `${String(Math.floor(endMinutes / 60) % 24).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  return `${localTime.slice(0, 5)} to ${end}${endMinutes >= 1440 ? " next day" : ""}`;
}

export default function ConsoleWebinarAutomation({ webinarId, durationSeconds, initialSchedules, initialEvents }: { webinarId: number; durationSeconds: number | null; initialSchedules: Schedule[]; initialEvents: TimedEvent[] }) {
  const [schedules, setSchedules] = useState(initialSchedules);
  const [events, setEvents] = useState(initialEvents);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { confirm, dialog } = useConfirm();
  function updateSchedule(index: number, patch: Partial<Schedule>) { setSchedules((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)); }
  function updateEvent(index: number, patch: Partial<TimedEvent>) { setEvents((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)); }
  async function removeSchedule(index: number) { if (await confirm({ message: "Remove this webinar schedule?", confirmLabel: "Remove schedule" })) setSchedules((current) => current.filter((_, itemIndex) => itemIndex !== index)); }
  async function removeEvent(index: number) { if (await confirm({ message: "Remove this timed room interaction and its saved quiz responses?", confirmLabel: "Remove interaction" })) setEvents((current) => current.filter((_, itemIndex) => itemIndex !== index)); }
  async function save() {
    setBusy(true); setError(""); setSuccess("");
    const response = await fetch(`/api/console/webinars/${webinarId}/automation`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(webinarAutomationPayload({ schedules, events })) });
    const body = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) return setError(body.error || "Could not save webinar automation.");
    setSchedules(body.schedules || []); setEvents(body.events || []); setSuccess("Schedule and room interactions saved.");
  }
  return <div className="mt-8 space-y-10">
    <section className="rounded-2xl border border-line bg-paper p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-display text-2xl font-semibold">Broadcast schedule</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">Set the exact start time. The end time is calculated from the uploaded recording, so every attendee shares one real broadcast window.</p>{durationSeconds ? <p className="mt-2 text-xs font-medium">Recording length: {timestamp(Math.round(durationSeconds))}</p> : <p className="mt-2 text-xs font-medium text-red-600">Upload and process the video before publishing so the broadcast end time is known.</p>}</div><div className="flex gap-2"><button className={buttonClass} onClick={() => setSchedules((current) => [...current, newWeekly()])}>Add weekly rule</button><button className={buttonClass} onClick={() => setSchedules((current) => [...current, newSpecific()])}>Add specific date</button></div></div>
      <div className="mt-6 space-y-4">{schedules.map((schedule, index) => <div key={schedule.id || `new-${index}`} className="rounded-2xl bg-paper-soft p-5"><div className="grid gap-4 md:grid-cols-[180px_1fr_160px_auto]"><div><label className="text-xs font-medium">Rule type</label><BrandSelect className="mt-1.5" value={schedule.schedule_kind} onChange={(value) => updateSchedule(index, { schedule_kind: value as Schedule["schedule_kind"], weekdays: value === "weekly" ? (schedule.weekdays.length ? schedule.weekdays : [2]) : [], specific_date: value === "specific" ? (schedule.specific_date || new Date().toISOString().slice(0, 10)) : null })} options={[{ value: "weekly", label: "Weekly" }, { value: "specific", label: "Specific date" }]} /></div><div><label className="text-xs font-medium">Timezone</label><BrandSelect className="mt-1.5" value={schedule.timezone} onChange={(timezone) => updateSchedule(index, { timezone })} options={timezones} /></div><div><label className="text-xs font-medium">Start time</label><input className={`${inputClass} mt-1.5`} type="time" value={schedule.local_time.slice(0, 5)} onChange={(event) => updateSchedule(index, { local_time: event.target.value })} /></div><button onClick={() => removeSchedule(index)} className="self-end rounded-full border border-line px-4 py-2.5 text-sm text-red-600">Remove</button></div>
        {schedule.schedule_kind === "weekly" ? <fieldset className="mt-4"><legend className="text-xs font-medium">Days of the week</legend><div className="mt-2 flex flex-wrap gap-2">{days.map((day, dayIndex) => { const selected = schedule.weekdays.includes(dayIndex); return <button type="button" key={day} onClick={() => updateSchedule(index, { weekdays: selected ? schedule.weekdays.filter((value) => value !== dayIndex) : [...schedule.weekdays, dayIndex].sort() })} className={`rounded-full border px-3 py-1.5 text-xs ${selected ? "border-ink bg-ink text-paper" : "border-line bg-paper"}`}>{day.slice(0, 3)}</button>; })}</div></fieldset> : <div className="mt-4 max-w-xs"><label className="text-xs font-medium">Session date</label><input className={`${inputClass} mt-1.5`} type="date" value={schedule.specific_date || ""} onChange={(event) => updateSchedule(index, { specific_date: event.target.value })} /></div>}
        <p className="mt-4 rounded-xl border border-line bg-paper px-3 py-2 text-xs"><span className="font-semibold">Broadcast window:</span> {scheduleWindow(schedule.local_time, durationSeconds)} ({schedule.timezone})</p>
      </div>)}{!schedules.length && <p className="rounded-xl border border-red-600 p-6 text-center text-sm text-red-600">No attendee broadcast is available. Add at least one weekly rule or specific date before publishing.</p>}</div>
    </section>
    <section className="rounded-2xl border border-line bg-paper p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-display text-2xl font-semibold">Timed interactions</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">Trigger a quiz, question, or offer at an exact video timestamp. A question is never scored -- it exists to record what each attendee actually says, so you can follow up individually. Q&amp;A mode makes it appear in the room&apos;s Q&amp;A sidebar instead of (or alongside) a popup.</p>{durationSeconds && <p className="mt-1 text-xs text-ink-soft">Recording length: {timestamp(Math.round(durationSeconds))}</p>}</div><div className="flex gap-2"><button className={buttonClass} onClick={() => setEvents((current) => [...current, newEvent("quiz")])}>Add quiz</button><button className={buttonClass} onClick={() => setEvents((current) => [...current, newEvent("question")])}>Ask question</button><button className={buttonClass} onClick={() => setEvents((current) => [...current, newEvent("cta")])}>Add CTA</button></div></div>
      <div className="mt-6 space-y-4">{events.map((item, index) => <div key={item.id || `new-${index}`} className="rounded-2xl bg-paper-soft p-5"><div className="grid gap-4 md:grid-cols-[160px_130px_1fr_150px_auto]"><div><label className="text-xs font-medium">Interaction</label><BrandSelect className="mt-1.5" value={item.event_type} onChange={(value) => { const replacement = newEvent(value as TimedEvent["event_type"]); updateEvent(index, { ...replacement, id: item.id, trigger_seconds: item.trigger_seconds }); }} options={[{ value: "quiz", label: "Quiz" }, { value: "question", label: "Question" }, { value: "cta", label: "Call to action" }]} /></div><div><label className="text-xs font-medium">Timestamp</label><input aria-label="Timestamp in minutes and seconds" className={`${inputClass} mt-1.5`} defaultValue={timestamp(item.trigger_seconds)} onBlur={(event) => updateEvent(index, { trigger_seconds: parseTimestamp(event.target.value) })} placeholder="12:30" /></div><div><label className="text-xs font-medium">Title</label><input className={`${inputClass} mt-1.5`} value={item.title} maxLength={200} onChange={(event) => updateEvent(index, { title: event.target.value })} /></div><div><label className="text-xs font-medium">Show as</label><BrandSelect className="mt-1.5" value={item.display_mode} onChange={(value) => updateEvent(index, { display_mode: value as TimedEvent["display_mode"] })} options={[{ value: "popup", label: "Popup" }, { value: "qa", label: "Q&A" }, { value: "both", label: "Popup and Q&A" }]} /></div><button onClick={() => removeEvent(index)} className="self-end rounded-full border border-line px-4 py-2.5 text-sm text-red-600">Remove</button></div>
        <div className="mt-4"><label className="text-xs font-medium">Supporting text</label><textarea rows={2} className={`${inputClass} mt-1.5 resize-y`} value={item.body || ""} maxLength={1000} onChange={(event) => updateEvent(index, { body: event.target.value })} /></div>
        {item.event_type === "quiz" ? <div className="mt-4 grid gap-4 md:grid-cols-[1fr_240px]"><div><label className="text-xs font-medium">Answers, one per line</label><textarea rows={4} className={`${inputClass} mt-1.5 resize-y`} value={item.options.join("\n")} onChange={(event) => updateEvent(index, { options: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean) })} /></div><div><label className="text-xs font-medium">Correct answer</label><BrandSelect className="mt-1.5" value={item.correct_option === null ? "none" : String(item.correct_option)} onChange={(value) => updateEvent(index, { correct_option: value === "none" ? null : Number(value) })} options={[{ value: "none", label: "No scored answer" }, ...item.options.map((option, optionIndex) => ({ value: String(optionIndex), label: option }))]} /></div></div>
        : item.event_type === "question" ? <div className="mt-4"><label className="text-xs font-medium">Response type</label><div className="mt-1.5 flex gap-2">{(["choice", "text"] as const).map((responseType) => <button type="button" key={responseType} onClick={() => updateEvent(index, { response_type: responseType, options: responseType === "choice" ? (item.options.length ? item.options : ["Yes", "No"]) : [] })} className={`rounded-full border px-4 py-2 text-xs font-medium ${item.response_type === responseType ? "border-ink bg-ink text-paper" : "border-line bg-paper"}`}>{responseType === "choice" ? "Multiple choice" : "Free text reply"}</button>)}</div>
            {item.response_type === "choice" && <div className="mt-3"><label className="text-xs font-medium">Answers, one per line</label><textarea rows={4} className={`${inputClass} mt-1.5 resize-y`} value={item.options.join("\n")} onChange={(event) => updateEvent(index, { options: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean) })} /></div>}
            {item.response_type === "text" && <p className="mt-3 text-xs text-ink-soft">Attendees will get an open text box instead of answer buttons.</p>}
          </div>
        : <div className="mt-4 grid gap-4 md:grid-cols-2"><div><label className="text-xs font-medium">Button label</label><input className={`${inputClass} mt-1.5`} value={item.cta_label || ""} onChange={(event) => updateEvent(index, { cta_label: event.target.value })} /></div><div><label className="text-xs font-medium">Destination URL</label><input type="url" className={`${inputClass} mt-1.5`} value={item.cta_url || ""} onChange={(event) => updateEvent(index, { cta_url: event.target.value })} /></div></div>}
      </div>)}{!events.length && <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">No timed quizzes, questions, or offers yet.</p>}</div>
    </section>
    {error && <p role="alert" className="rounded-xl border border-red-600 p-3 text-sm text-red-600">{error}</p>}{success && <p role="status" className="rounded-xl border border-line bg-paper-soft p-3 text-sm">{success}</p>}<div className="flex justify-end"><button disabled={busy} onClick={save} className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper disabled:opacity-40">{busy ? "Saving..." : "Save automation"}</button></div>{dialog}
  </div>;
}
