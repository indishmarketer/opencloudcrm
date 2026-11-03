"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MonthCalendar, toDateKey } from "@/components/MonthCalendar";

export type MeetingDetailBooking = {
  id: number;
  attendee_name: string;
  attendee_email: string;
  attendee_timezone: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  actual_start_at: string | null;
  actual_end_at: string | null;
  host_no_show: boolean;
  guest_no_show: boolean;
  cancellation_reason: string | null;
  notes: string | null;
  admin_notes: string | null;
  meeting_type_slug: string;
  meeting_type_name: string;
  calcom_booking_uid: string;
  contact_id: number | null;
  created_at: string;
  rescheduled_from_booking_id: number | null;
  duration_minutes: number;
};

function isUpcoming(booking: MeetingDetailBooking): boolean {
  return booking.status === "confirmed" && new Date(booking.scheduled_end).getTime() > Date.now();
}

export default function ConsoleMeetingDetail({
  booking,
  onClose,
  onCancel,
  onDelete,
  onReschedule,
  onToggleNoShow,
  onSaveAdminNotes,
  startInReschedule,
}: {
  booking: MeetingDetailBooking;
  onClose: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onReschedule: (slot: { start: string; end: string }) => Promise<string | null>;
  onToggleNoShow: (field: "host_no_show" | "guest_no_show") => Promise<string | null>;
  onSaveAdminNotes: (text: string) => Promise<string | null>;
  startInReschedule?: boolean;
}) {
  const [view, setView] = useState<"summary" | "reschedule">(startInReschedule ? "reschedule" : "summary");
  const [adminNotesDraft, setAdminNotesDraft] = useState(booking.admin_notes || "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [selectedDate, setSelectedDate] = useState(startInReschedule ? toDateKey(new Date()) : "");
  const [slots, setSlots] = useState<{ start: string; end: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState("");
  const [noShowBusy, setNoShowBusy] = useState<"host_no_show" | "guest_no_show" | null>(null);
  const [noShowError, setNoShowError] = useState("");

  useEffect(() => {
    if (view !== "reschedule" || !selectedDate) return;
    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the fetch this same effect kicks off, cleared in .finally()
    setLoadingSlots(true);
    const dayStart = new Date(`${selectedDate}T00:00:00`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    fetch(`/api/meetings/availability?slug=${encodeURIComponent(booking.meeting_type_slug)}&start=${encodeURIComponent(dayStart.toISOString())}&end=${encodeURIComponent(dayEnd.toISOString())}&timezone=${encodeURIComponent(booking.attendee_timezone)}`)
      .then((res) => res.json())
      .then((data) => { if (isMounted) setSlots(data.slots || []); })
      .finally(() => { if (isMounted) setLoadingSlots(false); });
    return () => { isMounted = false; };
  }, [view, selectedDate, booking.meeting_type_slug, booking.attendee_timezone]);

  const currentTimeLabel = useMemo(
    () => new Date(booking.scheduled_start).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" }),
    [booking.scheduled_start]
  );

  async function confirmReschedule() {
    if (!selectedSlot) return;
    setRescheduling(true);
    setRescheduleError("");
    try {
      const error = await onReschedule(selectedSlot);
      if (error) { setRescheduleError(error); return; }
      onClose();
    } finally {
      setRescheduling(false);
    }
  }

  async function saveAdminNotes() {
    setSavingNotes(true);
    setNotesError("");
    setNotesSaved(false);
    try {
      const error = await onSaveAdminNotes(adminNotesDraft.trim());
      if (error) { setNotesError(error); return; }
      setNotesSaved(true);
    } finally {
      setSavingNotes(false);
    }
  }

  async function toggleNoShow(field: "host_no_show" | "guest_no_show") {
    setNoShowBusy(field);
    setNoShowError("");
    try {
      const error = await onToggleNoShow(field);
      if (error) setNoShowError(error);
    } finally {
      setNoShowBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-paper p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">{booking.meeting_type_name}</h2>
            <p className="mt-1 text-sm text-ink-soft">{booking.attendee_name} &lt;{booking.attendee_email}&gt;</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-soft hover:border-ink hover:text-ink">
            Close
          </button>
        </div>

        {view === "summary" ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-line bg-paper-soft p-4 text-sm">
              <p><strong>Time:</strong> {currentTimeLabel}</p>
              <p className="mt-1 text-ink-soft">Timezone: {booking.attendee_timezone} &middot; {booking.duration_minutes} min</p>
              <p className="mt-1 text-ink-soft">Booked {new Date(booking.created_at).toLocaleString()}</p>
              {booking.rescheduled_from_booking_id && (
                <p className="mt-1 text-ink-soft">Rescheduled from an earlier booking (#{booking.rescheduled_from_booking_id}).</p>
              )}
            </div>

            {booking.notes && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Message from attendee</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-line bg-paper-soft p-3 text-sm">{booking.notes}</p>
              </div>
            )}

            {booking.cancellation_reason && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Cancellation reason</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{booking.cancellation_reason}</p>
              </div>
            )}

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Private notes (only you see this)</p>
              <textarea
                value={adminNotesDraft}
                onChange={(e) => { setAdminNotesDraft(e.target.value); setNotesSaved(false); }}
                rows={2}
                maxLength={2000}
                placeholder="e.g. asked about pricing, follow up in a week"
                className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
              />
              <div className="mt-1 flex items-center gap-3">
                <button
                  type="button"
                  disabled={savingNotes || adminNotesDraft.trim() === (booking.admin_notes || "")}
                  onClick={saveAdminNotes}
                  className="rounded-full border border-line px-3 py-1 text-xs font-medium hover:border-ink disabled:opacity-40"
                >
                  {savingNotes ? "Saving…" : "Save note"}
                </button>
                {notesSaved && <span className="text-xs text-ink-soft">Saved.</span>}
                {notesError && <span className="text-xs text-red-600">{notesError}</span>}
              </div>
            </div>

            <div className="rounded-lg border border-line p-4 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Attendance</p>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={booking.host_no_show} disabled={noShowBusy === "host_no_show"} onChange={() => toggleNoShow("host_no_show")} />
                  Host no-show
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={booking.guest_no_show} disabled={noShowBusy === "guest_no_show"} onChange={() => toggleNoShow("guest_no_show")} />
                  Attendee no-show
                </label>
              </div>
              {booking.actual_start_at && booking.actual_end_at && (
                <p className="mt-2 text-ink-soft">
                  Actual duration: {Math.max(1, Math.round((new Date(booking.actual_end_at).getTime() - new Date(booking.actual_start_at).getTime()) / 60000))} min
                </p>
              )}
              {noShowError && <p className="mt-2 text-red-600">{noShowError}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {isUpcoming(booking) && (
                <a href={`https://app.cal.com/video/${encodeURIComponent(booking.calcom_booking_uid)}`} target="_blank" rel="noopener noreferrer" className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80">
                  Join meeting
                </a>
              )}
              {booking.status === "confirmed" && isUpcoming(booking) && (
                <button type="button" onClick={() => { setView("reschedule"); setSelectedDate(toDateKey(new Date())); }} className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink">
                  Reschedule
                </button>
              )}
              {isUpcoming(booking) ? (
                <button type="button" onClick={onCancel} className="rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:border-red-500">
                  Cancel meeting
                </button>
              ) : (
                <button type="button" onClick={onDelete} className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink-soft hover:border-red-500 hover:text-red-600">
                  Delete record
                </button>
              )}
              {booking.contact_id && (
                <Link href={`/console/contacts/c-${booking.contact_id}`} className="ml-auto text-sm font-medium underline hover:text-ink-soft">
                  View contact
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <button type="button" onClick={() => { setView("summary"); setSelectedSlot(null); }} className="text-sm text-ink-soft underline hover:text-ink">
              ← Back
            </button>
            {selectedSlot ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-line bg-paper-soft p-4 text-sm">
                  <p><strong>New time:</strong> {new Date(selectedSlot.start).toLocaleString()}</p>
                  <p className="mt-1 text-ink-soft">Timezone: {booking.attendee_timezone}</p>
                </div>
                {rescheduleError && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-600">{rescheduleError}</div>}
                <div className="flex gap-3">
                  <button type="button" disabled={rescheduling} onClick={confirmReschedule} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50">
                    {rescheduling ? "Rescheduling…" : "Confirm new time"}
                  </button>
                  <button type="button" onClick={() => setSelectedSlot(null)} className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink">
                    Change time
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-[minmax(0,240px)_1fr]">
                <div className="rounded-xl border border-line p-3">
                  <MonthCalendar selectedDate={selectedDate} onSelect={setSelectedDate} />
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
                          className="rounded-lg border border-line px-3 py-2 text-sm font-medium transition-colors hover:border-ink hover:bg-paper-soft"
                        >
                          {new Date(slot.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
