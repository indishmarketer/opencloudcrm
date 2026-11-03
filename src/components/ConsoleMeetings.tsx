"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";
import BrandDatePicker from "@/components/BrandDatePicker";
import BrandSelect from "@/components/BrandSelect";
import ConsoleMeetingsTabs from "@/components/ConsoleMeetingsTabs";
import ConsoleMeetingsWeekView from "@/components/ConsoleMeetingsWeekView";
import ConsoleMeetingDetail from "@/components/ConsoleMeetingDetail";
import ConsoleAddMeeting from "@/components/ConsoleAddMeeting";

type Booking = { id: number; attendee_name: string; attendee_email: string; attendee_timezone: string; scheduled_start: string; scheduled_end: string; status: string; actual_start_at: string | null; actual_end_at: string | null; host_no_show: boolean; guest_no_show: boolean; cancellation_reason: string | null; notes: string | null; admin_notes: string | null; meeting_type_slug: string; meeting_type_name: string; calcom_booking_uid: string; contact_id: number | null; created_at: string; rescheduled_from_booking_id: number | null; duration_minutes: number };
type Filters = { status: string; type: string; from: string; to: string; q: string };
type Pagination = { page: number; pageSize: number; totalCount: number; totalPages: number };
function statusClass(status: string): string { return status === "cancelled" ? "border-red-300 text-red-600" : status === "confirmed" ? "border-ink bg-ink text-paper" : "border-line text-ink-soft"; }

/** Real, Cal.com-reported attendance/duration -- populated by MEETING_STARTED
 * / MEETING_ENDED / AFTER_*_CAL_VIDEO_NO_SHOW webhook events, not anything
 * we infer ourselves. */
function attendanceCell(booking: Booking): string {
  if (booking.guest_no_show) return "Attendee no-show";
  if (booking.host_no_show) return "Host no-show";
  if (booking.actual_start_at && booking.actual_end_at) {
    const minutes = Math.max(1, Math.round((new Date(booking.actual_end_at).getTime() - new Date(booking.actual_start_at).getTime()) / 60000));
    return `${minutes} min`;
  }
  if (booking.actual_start_at) return "In progress";
  if (booking.status === "confirmed" && new Date(booking.scheduled_start).getTime() < Date.now()) return "No data yet";
  return "Not yet";
}

/** Cal.com refuses to cancel a booking whose time has already passed
 * ("Cannot cancel a booking that has already ended") -- only offer Cancel
 * for genuinely upcoming confirmed bookings; everything else (past,
 * cancelled, rescheduled, completed) gets Delete instead. */
function isCancellable(booking: Booking): boolean {
  return booking.status === "confirmed" && new Date(booking.scheduled_end).getTime() > Date.now();
}

/** Confirmed via a real failed attempt: Cal.com's reschedule endpoint
 * rejects a past booking too ("Rescheduling past bookings is not allowed
 * for this event type", 403) -- same restriction as Cancel, not offered
 * only for future bookings. */
function isReschedulable(booking: Booking): boolean {
  return isCancellable(booking);
}

export default function ConsoleMeetings({ bookings, types, filters, pagination }: { bookings: Booking[]; types: { slug: string; name: string }[]; filters: Filters; pagination: Pagination }) {
  const [rows, setRows] = useState(bookings);
  // Keeps the list in sync after router.refresh() re-fetches the server
  // component's data (used after manually adding a booking) -- rows is
  // otherwise a local fork of the `bookings` prop, needed for the
  // optimistic cancel/delete/reschedule updates below, so it doesn't pick
  // up new props on its own.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(bookings);
  }, [bookings]);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [q, setQ] = useState(filters.q);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [view, setView] = useState<"list" | "week">("list");
  const [openBookingId, setOpenBookingId] = useState<number | null>(null);
  const [openMode, setOpenMode] = useState<"summary" | "reschedule">("summary");
  const { confirm, dialog } = useConfirm();
  const router = useRouter();
  const pathname = usePathname();
  const openBooking = rows.find((r) => r.id === openBookingId) || null;

  function openDetail(booking: Booking, mode: "summary" | "reschedule" = "summary") {
    setOpenBookingId(booking.id);
    setOpenMode(mode);
  }

  async function handleReschedule(bookingId: number, slot: { start: string; end: string }): Promise<string | null> {
    try {
      const response = await fetch(`/api/meetings/${bookingId}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: slot.start, reason: "Rescheduled by console administrator" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return body.error || "Could not reschedule the meeting.";
      const newBooking = rows.find((r) => r.id === bookingId);
      if (!newBooking) return null;
      const updated: Booking = {
        ...newBooking,
        id: Number(body.booking.id),
        calcom_booking_uid: body.booking.calcom_booking_uid,
        scheduled_start: body.booking.scheduled_start,
        scheduled_end: body.booking.scheduled_end,
        status: "confirmed",
        notes: body.booking.notes ?? newBooking.notes,
        actual_start_at: null,
        actual_end_at: null,
        host_no_show: false,
        guest_no_show: false,
        cancellation_reason: null,
        rescheduled_from_booking_id: bookingId,
        created_at: new Date().toISOString(),
      };
      setRows((current) => {
        const withOldMarked = current.map((row) => row.id === bookingId ? { ...row, status: "rescheduled" } : row);
        // Same underlying Cal.com uid -- the booking was moved in place rather
        // than getting a brand-new row, so there's nothing else to insert.
        if (Number(body.booking.id) === bookingId) return current.map((row) => row.id === bookingId ? { ...row, ...updated } : row);
        return [updated, ...withOldMarked];
      });
      return null;
    } catch {
      return "Could not reschedule the meeting.";
    }
  }

  async function handleToggleNoShow(bookingId: number, field: "host_no_show" | "guest_no_show"): Promise<string | null> {
    const current = rows.find((r) => r.id === bookingId);
    if (!current) return null;
    try {
      const response = await fetch(`/api/meetings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: !current[field] }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return body.error || "Could not update this.";
      setRows((rowsState) => rowsState.map((row) => row.id === bookingId ? { ...row, [field]: body[field] } : row));
      return null;
    } catch {
      return "Could not update this.";
    }
  }

  async function handleSaveAdminNotes(bookingId: number, text: string): Promise<string | null> {
    try {
      const response = await fetch(`/api/meetings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_notes: text }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return body.error || "Could not save this note.";
      setRows((rowsState) => rowsState.map((row) => row.id === bookingId ? { ...row, admin_notes: body.admin_notes } : row));
      return null;
    } catch {
      return "Could not save this note.";
    }
  }

  function buildQuery(next: Partial<Filters> & { page?: number }) {
    const merged = { status: filters.status, type: filters.type, from, to, q, page: pagination.page, ...next };
    const params = new URLSearchParams();
    if (merged.status) params.set("status", merged.status);
    if (merged.type) params.set("type", merged.type);
    if (merged.from) params.set("from", merged.from);
    if (merged.to) params.set("to", merged.to);
    if (merged.q) params.set("q", merged.q);
    if (merged.page && merged.page > 1) params.set("page", String(merged.page));
    return params;
  }

  function applyFilters(next: Partial<Filters>) {
    // Any filter change resets back to page 1 -- staying on page 6 of a
    // narrower result set would just show "no bookings match."
    const query = buildQuery({ ...next, page: 1 }).toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function goToPage(page: number) {
    const query = buildQuery({ page }).toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function toggleSelect(id: number) {
    setSelected((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function toggleSelectAll() {
    setSelected((s) => (s.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  async function cancelBooking(booking: Booking) {
    if (!(await confirm({ message: `Cancel ${booking.meeting_type_name} for ${booking.attendee_email}?`, confirmLabel: "Cancel meeting" }))) return;
    setBusyId(booking.id); setError("");
    try {
      const response = await fetch(`/api/meetings/${booking.id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Cancelled by console administrator" }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.error || "Could not cancel the meeting."); return; }
      setRows(current => current.map(row => row.id === booking.id ? { ...row, status: "cancelled", cancellation_reason: "Cancelled by console administrator" } : row));
    } catch { setError("Could not cancel the meeting."); } finally { setBusyId(null); }
  }

  async function deleteBooking(booking: Booking) {
    if (!(await confirm({ message: `Permanently delete this ${booking.meeting_type_name} record for ${booking.attendee_email}? This can't be undone.`, confirmLabel: "Delete" }))) return;
    setBusyId(booking.id); setError("");
    try {
      const response = await fetch(`/api/meetings/${booking.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.error || "Could not delete the meeting."); return; }
      setRows(current => current.filter(row => row.id !== booking.id));
      setSelected((s) => { const next = new Set(s); next.delete(booking.id); return next; });
    } catch { setError("Could not delete the meeting."); } finally { setBusyId(null); }
  }

  async function bulkAction(kind: "cancel" | "delete") {
    const targets = rows.filter((r) => selected.has(r.id) && (kind === "cancel" ? isCancellable(r) : true));
    if (!targets.length) return;
    const ok = await confirm({
      message: kind === "cancel"
        ? `Cancel ${targets.length} selected meeting${targets.length === 1 ? "" : "s"}?`
        : `Permanently delete ${targets.length} selected meeting record${targets.length === 1 ? "" : "s"}? This can't be undone.`,
      confirmLabel: kind === "cancel" ? "Cancel meetings" : "Delete",
    });
    if (!ok) return;
    setBulkBusy(true); setError("");
    let failed = 0;
    for (const booking of targets) {
      try {
        const response = kind === "cancel"
          ? await fetch(`/api/meetings/${booking.id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Cancelled by console administrator" }) })
          : await fetch(`/api/meetings/${booking.id}`, { method: "DELETE" });
        if (!response.ok) { failed++; continue; }
        if (kind === "cancel") {
          setRows((current) => current.map((row) => row.id === booking.id ? { ...row, status: "cancelled", cancellation_reason: "Cancelled by console administrator" } : row));
        } else {
          setRows((current) => current.filter((row) => row.id !== booking.id));
        }
      } catch { failed++; }
    }
    setSelected(new Set());
    if (failed) setError(`${failed} of ${targets.length} selected meetings could not be ${kind === "cancel" ? "cancelled" : "deleted"}.`);
    setBulkBusy(false);
  }

  const exportHref = `/api/console/meetings/export?${buildQuery({}).toString()}`;
  const selectedCancellable = rows.filter((r) => selected.has(r.id) && isCancellable(r)).length;

  return <div>
    {dialog}
    {openBooking && (
      <ConsoleMeetingDetail
        booking={openBooking}
        startInReschedule={openMode === "reschedule"}
        onClose={() => setOpenBookingId(null)}
        onCancel={() => cancelBooking(openBooking)}
        onDelete={() => deleteBooking(openBooking)}
        onReschedule={(slot) => handleReschedule(openBooking.id, slot)}
        onToggleNoShow={(field) => handleToggleNoShow(openBooking.id, field)}
        onSaveAdminNotes={(text) => handleSaveAdminNotes(openBooking.id, text)}
      />
    )}
    {adding && (
      <ConsoleAddMeeting
        types={types}
        onClose={() => setAdding(false)}
        onCreated={() => { setAdding(false); router.refresh(); }}
      />
    )}
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Meetings</h1>
        <p className="mt-2 text-sm text-ink-soft">Bookings, and how each one actually went.</p>
      </div>
      <span className="text-sm text-ink-soft">{pagination.totalCount} booking{pagination.totalCount === 1 ? "" : "s"}</span>
    </div>
    <div className="mt-6"><ConsoleMeetingsTabs /></div>

    <div className="mt-6 flex gap-2">
      {(["list", "week"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setView(v)}
          className={`rounded-full border px-4 py-1.5 text-xs font-medium ${view === v ? "border-ink bg-ink text-paper" : "border-line text-ink-soft hover:border-ink"}`}
        >
          {v === "list" ? "List" : "Week"}
        </button>
      ))}
    </div>

    {view === "week" ? (
      <ConsoleMeetingsWeekView />
    ) : (
    <>
    <div className="mt-8 grid gap-3 rounded-2xl border border-line bg-paper-soft p-4 sm:grid-cols-2 lg:grid-cols-6">
      <div className="sm:col-span-2 lg:col-span-2">
        <label className="text-xs font-medium text-ink-soft">Search</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") applyFilters({ q }); }}
          onBlur={() => { if (q !== filters.q) applyFilters({ q }); }}
          placeholder="Name or email…"
          className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-ink-soft">Status</label>
        <BrandSelect
          className="mt-1"
          value={filters.status}
          onChange={(v) => applyFilters({ status: v })}
          placeholder="All statuses"
          options={[
            { value: "", label: "All statuses" },
            { value: "confirmed", label: "Confirmed" },
            { value: "cancelled", label: "Cancelled" },
            { value: "rescheduled", label: "Rescheduled" },
            { value: "completed", label: "Completed" },
          ]}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-ink-soft">Meeting type</label>
        <BrandSelect
          className="mt-1"
          value={filters.type}
          onChange={(v) => applyFilters({ type: v })}
          placeholder="All types"
          options={[{ value: "", label: "All types" }, ...types.map((type) => ({ value: type.slug, label: type.name }))]}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-ink-soft">From</label>
        <BrandDatePicker
          className="mt-1"
          variant="input"
          fullWidth
          value={from}
          max={to || undefined}
          onChange={(v) => { setFrom(v); applyFilters({ from: v }); }}
          ariaLabel="Filter meetings from date"
          placeholder="Pick a date"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-ink-soft">To</label>
        <BrandDatePicker
          className="mt-1"
          variant="input"
          fullWidth
          align="right"
          value={to}
          min={from || undefined}
          onChange={(v) => { setTo(v); applyFilters({ to: v }); }}
          ariaLabel="Filter meetings to date"
          placeholder="Pick a date"
        />
      </div>
    </div>

    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {selected.size > 0 && (
          <>
            <span className="text-xs text-ink-soft">{selected.size} selected</span>
            {selectedCancellable > 0 && (
              <button type="button" disabled={bulkBusy} onClick={() => bulkAction("cancel")} className="rounded-full border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:border-red-500 disabled:opacity-50">
                Cancel selected ({selectedCancellable})
              </button>
            )}
            <button type="button" disabled={bulkBusy} onClick={() => bulkAction("delete")} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-soft hover:border-red-500 hover:text-red-600 disabled:opacity-50">
              Delete selected ({selected.size})
            </button>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setAdding(true)} className="rounded-full border border-ink bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-80">
          Add booking
        </button>
        <a href={exportHref} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-soft hover:border-ink hover:text-ink">
          Export matching bookings (CSV)
        </a>
      </div>
    </div>

    {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

    <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-paper">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="border-b border-line text-ink-soft">
          <tr>
            <th className="w-10 px-4 py-3">
              <input
                type="checkbox"
                checked={rows.length > 0 && selected.size === rows.length}
                onChange={toggleSelectAll}
                aria-label="Select all bookings on this page"
                className="h-4 w-4 rounded border-line accent-ink cursor-pointer"
              />
            </th>
            <th className="px-4 py-3 font-medium">Attendee</th>
            <th className="px-4 py-3 font-medium">Meeting</th>
            <th className="px-4 py-3 font-medium">Scheduled</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Attendance / duration</th>
            <th className="px-4 py-3 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map(booking => (
            <tr key={booking.id} className="border-b border-line last:border-0">
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.has(booking.id)}
                  onChange={() => toggleSelect(booking.id)}
                  aria-label={`Select booking with ${booking.attendee_name}`}
                  className="h-4 w-4 rounded border-line accent-ink cursor-pointer"
                />
              </td>
              <td className="max-w-[220px] px-4 py-3">
                <button type="button" onClick={() => openDetail(booking)} className="truncate text-left font-medium underline-offset-2 hover:underline">
                  {booking.attendee_name}
                </button>
                <div className="truncate text-xs text-ink-soft" title={booking.attendee_email}>{booking.attendee_email}</div>
                {booking.notes && (
                  <div className="mt-1 truncate text-xs italic text-ink-soft" title={booking.notes}>
                    &ldquo;{booking.notes}&rdquo;
                  </div>
                )}
              </td>
              <td className="px-4 py-3">{booking.meeting_type_name}</td>
              <td className="px-4 py-3 text-ink-soft">{new Date(booking.scheduled_start).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</td>
              <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(booking.status)}`}>{booking.status}</span></td>
              <td className="px-4 py-3 text-xs text-ink-soft">{attendanceCell(booking)}</td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => openDetail(booking)} className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-soft hover:border-ink hover:text-ink">
                    Open
                  </button>
                  {isReschedulable(booking) && (
                    <button type="button" disabled={busyId === booking.id} onClick={() => openDetail(booking, "reschedule")} className="rounded-full border border-line px-3 py-1 text-xs font-medium hover:border-ink disabled:opacity-50">
                      Reschedule
                    </button>
                  )}
                  {isCancellable(booking) ? (
                    <button type="button" disabled={busyId === booking.id} onClick={() => cancelBooking(booking)} className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:border-red-500 disabled:opacity-50">
                      Cancel
                    </button>
                  ) : (
                    <button type="button" disabled={busyId === booking.id} onClick={() => deleteBooking(booking)} className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-soft hover:border-red-500 hover:text-red-600 disabled:opacity-50">
                      Delete
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-ink-soft">No bookings match these filters.</td></tr>}
        </tbody>
      </table>
    </div>

    {pagination.totalPages > 1 && (
      <div className="mt-4 flex items-center justify-between text-sm text-ink-soft">
        <span>
          Page {pagination.page} of {pagination.totalPages} &middot; showing {rows.length} of {pagination.totalCount}
        </span>
        <div className="flex gap-2">
          <button type="button" disabled={pagination.page <= 1} onClick={() => goToPage(pagination.page - 1)} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink disabled:opacity-40">
            Previous
          </button>
          <button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => goToPage(pagination.page + 1)} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink disabled:opacity-40">
            Next
          </button>
        </div>
      </div>
    )}
    </>
    )}
  </div>;
}
