"use client";

import { useEffect, useMemo, useState } from "react";
import { MonthCalendar, toDateKey } from "@/components/MonthCalendar";
import { useConfirm } from "@/components/ConfirmDialog";

type Props = {
  bookingId: number;
  token: string;
  meetingTypeSlug: string;
  status: string;
  scheduledStart: string;
  attendeeTimezone: string;
  joinUrl: string;
};

export default function ManageBookingWidget({ bookingId, token, meetingTypeSlug, status, scheduledStart, attendeeTimezone, joinUrl }: Props) {
  const [view, setView] = useState<"summary" | "reschedule">("summary");
  const [selectedDate, setSelectedDate] = useState("");
  // No timezone switcher here (unlike the original booking widget) --
  // rescheduling keeps the attendee's original timezone.
  const timezone = attendeeTimezone;
  const [slots, setSlots] = useState<{ start: string; end: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<"rescheduled" | "cancelled" | null>(null);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    if (view !== "reschedule") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedDate(toDateKey(new Date()));
  }, [view]);

  useEffect(() => {
    if (view !== "reschedule" || !selectedDate || !timezone) return;
    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingSlots(true);
    const dayStart = new Date(`${selectedDate}T00:00:00`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    fetch(`/api/meetings/availability?slug=${encodeURIComponent(meetingTypeSlug)}&start=${encodeURIComponent(dayStart.toISOString())}&end=${encodeURIComponent(dayEnd.toISOString())}&timezone=${encodeURIComponent(timezone)}`)
      .then((res) => res.json())
      .then((data) => { if (isMounted) setSlots(data.slots || []); })
      .finally(() => { if (isMounted) setLoadingSlots(false); });
    return () => { isMounted = false; };
  }, [view, selectedDate, timezone, meetingTypeSlug]);

  const currentTimeLabel = useMemo(() => new Date(scheduledStart).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" }), [scheduledStart]);

  async function confirmReschedule() {
    if (!selectedSlot) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/meetings/${bookingId}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: selectedSlot.start, timezone, manageToken: token }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) { setError(body?.error || "Could not reschedule. Please try again."); return; }
      setDone("rescheduled");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!(await confirm({ message: "Cancel this meeting?", confirmLabel: "Cancel meeting" }))) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/meetings/${bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manageToken: token }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) { setError(body?.error || "Could not cancel. Please try again."); return; }
      setDone("cancelled");
    } finally {
      setBusy(false);
    }
  }

  if (status !== "confirmed" && !done) {
    return <p className="text-sm text-ink-soft">This booking is {status} and can no longer be managed here.</p>;
  }

  if (done === "cancelled") {
    return <p className="text-sm text-ink-soft">This meeting has been cancelled. You can book a new time whenever you&apos;re ready.</p>;
  }
  if (done === "rescheduled") {
    return <p className="text-sm text-ink-soft">Rescheduled. Check your email for the new time and updated meeting link.</p>;
  }

  if (view === "summary") {
    return (
      <div className="space-y-6">
        {dialog}
        <div className="rounded-lg border border-line bg-paper-soft p-4">
          <p className="text-sm"><strong>Time:</strong> {currentTimeLabel}</p>
          <p className="mt-1 text-sm text-ink-soft">Timezone: {attendeeTimezone}</p>
        </div>
        {error && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        <div className="flex flex-wrap gap-3">
          <a href={joinUrl} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80">Join meeting</a>
          <button type="button" onClick={() => setView("reschedule")} className="rounded-full border border-line px-5 py-2.5 text-sm font-medium hover:border-ink">Reschedule</button>
          <button type="button" disabled={busy} onClick={handleCancel} className="rounded-full border border-red-300 px-5 py-2.5 text-sm font-medium text-red-600 hover:border-red-500 disabled:opacity-50">Cancel meeting</button>
        </div>
      </div>
    );
  }

  if (selectedSlot) {
    return (
      <div className="space-y-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">Confirm new time</h3>
          <button type="button" onClick={() => setSelectedSlot(null)} className="text-sm text-ink-soft underline hover:text-ink">Change time</button>
        </div>
        <div className="rounded-lg border border-line bg-paper-soft p-4">
          <p className="text-sm"><strong>New time:</strong> {new Date(selectedSlot.start).toLocaleString()}</p>
          <p className="mt-1 text-sm text-ink-soft">Timezone: {timezone}</p>
        </div>
        {error && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        <button type="button" disabled={busy} onClick={confirmReschedule} className="w-full rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50">
          {busy ? "Rescheduling…" : "Confirm new time"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button type="button" onClick={() => setView("summary")} className="text-sm text-ink-soft underline hover:text-ink">← Back</button>
      <div className="grid gap-8 md:grid-cols-[minmax(0,300px)_1fr]">
        <div className="rounded-xl border border-line p-4">
          <MonthCalendar selectedDate={selectedDate} onSelect={setSelectedDate} />
        </div>
        <div>
          <h3 className="mb-3 font-display text-lg font-semibold">
            {selectedDate ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Available slots"}
          </h3>
          {loadingSlots ? (
            <p className="animate-pulse text-sm text-ink-soft">Loading slots…</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-ink-soft">No slots available on this date. Try another day on the calendar.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {slots.map((slot, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className="rounded-lg border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-ink hover:bg-paper-soft focus:outline-none focus:ring-2 focus:ring-ink focus:ring-offset-2"
                >
                  {new Date(slot.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
