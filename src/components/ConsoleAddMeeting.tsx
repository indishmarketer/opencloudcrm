"use client";

import { useEffect, useMemo, useState } from "react";
import BrandSelect from "@/components/BrandSelect";
import { MonthCalendar, toDateKey } from "@/components/MonthCalendar";

function allTimeZones(): string[] {
  try { return Intl.supportedValuesOf("timeZone"); } catch { return ["UTC"]; }
}

/** Books a real Cal.com slot on the admin's behalf -- for someone who
 * agreed on a time by phone/email instead of using the public widget.
 * Deliberately reuses the exact same /api/meetings/book endpoint the
 * public booking widget uses (see MeetingBookingWidget.tsx): it's already
 * public/rate-limited, so there's no separate admin-only booking path to
 * maintain, and the attendee still gets the same real Cal Video room,
 * confirmation email, and calendar invite as any other booking. */
export default function ConsoleAddMeeting({
  types,
  onClose,
  onCreated,
}: {
  types: { slug: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [slug, setSlug] = useState(types[0]?.slug || "");
  const [timezone, setTimezone] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [slots, setSlots] = useState<{ start: string; end: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const timeZoneOptions = useMemo(() => allTimeZones().map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") })), []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the visitor's real timezone/today are only knowable client-side post-mount; computing them during render would mismatch SSR
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setSelectedDate(toDateKey(new Date()));
  }, []);

  useEffect(() => {
    if (!slug || !timezone || !selectedDate) return;
    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the fetch this same effect kicks off, cleared in .finally()
    setLoadingSlots(true);
    setError("");
    const dayStart = new Date(`${selectedDate}T00:00:00`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    fetch(`/api/meetings/availability?slug=${encodeURIComponent(slug)}&start=${encodeURIComponent(dayStart.toISOString())}&end=${encodeURIComponent(dayEnd.toISOString())}&timezone=${encodeURIComponent(timezone)}`)
      .then((res) => res.json())
      .then((data) => { if (isMounted) setSlots(data.slots || []); })
      .finally(() => { if (isMounted) setLoadingSlots(false); });
    return () => { isMounted = false; };
  }, [slug, selectedDate, timezone]);

  async function handleBook() {
    if (!selectedSlot || !name.trim() || !email.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/meetings/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, start: selectedSlot.start, timezone, name: name.trim(), email: email.trim(), notes: notes.trim() || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) { setError(data?.error || "Could not create this booking."); return; }
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-paper p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Add booking</h2>
          <button type="button" onClick={onClose} className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-soft hover:border-ink hover:text-ink">
            Close
          </button>
        </div>
        <p className="mt-1 text-sm text-ink-soft">For someone you already agreed a time with by phone or email -- this creates a real booking, same as if they&apos;d booked it themselves.</p>

        {error && <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-ink-soft">Meeting type</label>
            <BrandSelect className="mt-1" value={slug} onChange={(v) => { setSlug(v); setSelectedSlot(null); }} options={types.map((t) => ({ value: t.slug, label: t.name }))} placeholder="Choose a type" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">Timezone (attendee&apos;s)</label>
            <BrandSelect className="mt-1" value={timezone} onChange={(v) => { setTimezone(v); setSelectedSlot(null); }} options={timeZoneOptions} placeholder="Select timezone" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-ink-soft">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink" />
          </div>
        </div>

        {!slug ? (
          <p className="mt-6 text-sm text-ink-soft">Create a meeting type first.</p>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-[minmax(0,240px)_1fr]">
            <div className="rounded-xl border border-line p-3">
              <MonthCalendar selectedDate={selectedDate} onSelect={(d) => { setSelectedDate(d); setSelectedSlot(null); }} />
            </div>
            <div>
              <h3 className="mb-3 font-display text-base font-semibold">
                {selectedDate ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Available slots"}
              </h3>
              {loadingSlots ? (
                <p className="animate-pulse text-sm text-ink-soft">Loading slots…</p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-ink-soft">No slots available on this date.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {slots.map((slot, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:border-ink hover:bg-paper-soft ${selectedSlot?.start === slot.start ? "border-ink bg-paper-soft" : "border-line"}`}
                    >
                      {new Date(slot.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={submitting || !selectedSlot || !name.trim() || !email.trim()}
            onClick={handleBook}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
