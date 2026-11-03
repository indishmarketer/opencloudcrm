"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import ConsoleWebinarTabs from "@/components/ConsoleWebinarTabs";
import { useConfirm } from "@/components/ConfirmDialog";
import { formatWebinarSessionWindow } from "@/lib/webinarReminders";

type Row = {
  id: number;
  session_start_at: string | null;
  attendee_timezone: string | null;
  registered_at: string;
  completed_at: string | null;
  watch_seconds: number | null;
  last_viewed_at: string | null;
  left_at: string | null;
  name: string | null;
  email: string | null;
  duration_seconds: number | null;
  server_now: string | number;
};
type Broadcast = { session_start_at: string; total: number; attended: number; completed: number; isFuture: boolean; offered: boolean };
type Filters = { q: string; session: string };
type Pagination = { page: number; pageSize: number; totalCount: number; totalPages: number };

function attendanceStatus(row: Row): string {
  if (row.completed_at) return "Completed";
  const now = Number(row.server_now);
  const start = new Date(String(row.session_start_at)).getTime();
  const end = start + Number(row.duration_seconds || 0) * 1000;
  const lastViewed = row.last_viewed_at ? new Date(row.last_viewed_at).getTime() : 0;
  if (now < start) return "Reserved";
  if (now < end && now - lastViewed < 45_000) return "In room";
  if (now < end && row.left_at) return "Left early";
  if (now >= end && Number(row.watch_seconds || 0) === 0) return "Missed";
  if (now >= end) return "Ended early";
  return "Not joined";
}

export default function ConsoleWebinarRegistrations({ webinar, rows, summary, broadcasts, filters, pagination }: {
  webinar: { id: number; title: string; duration_seconds: number | null };
  rows: Row[];
  summary: { total: number; attended: number; completed: number };
  broadcasts: Broadcast[];
  filters: Filters;
  pagination: Pagination;
}) {
  const [q, setQ] = useState(filters.q);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const { confirm, dialog } = useConfirm();

  function buildQuery(next: Partial<Filters> & { page?: number }) {
    const merged = { q, session: filters.session, page: pagination.page, ...next };
    const params = new URLSearchParams();
    if (merged.q) params.set("q", merged.q);
    if (merged.session) params.set("session", merged.session);
    if (merged.page && merged.page > 1) params.set("page", String(merged.page));
    return params;
  }

  function applySearch(next: Partial<Filters>) {
    const query = buildQuery({ ...next, page: 1 }).toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function goToPage(page: number) {
    const query = buildQuery({ page }).toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  async function deleteRegistrations(body: { ids: number[] } | { sessionStartAt: string }) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/console/webinars/${webinar.id}/registrations`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not delete these registrations.");
      }
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete these registrations.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSelected() {
    const ok = await confirm({ message: `Delete ${selected.size} registration${selected.size === 1 ? "" : "s"}? This removes their reservation and attendance record permanently.` });
    if (!ok) return;
    await deleteRegistrations({ ids: [...selected] });
  }

  async function handleDeleteBroadcast(b: Broadcast) {
    const when = formatWebinarSessionWindow(b.session_start_at, Number(webinar.duration_seconds || 0), "Asia/Kolkata");
    const ok = await confirm({ message: `Delete all ${b.total} registration${b.total === 1 ? "" : "s"} for the broadcast at ${when}? This is permanent, including anyone's attendance history for that time.` });
    if (!ok) return;
    await deleteRegistrations({ sessionStartAt: b.session_start_at });
  }

  function toggleRow(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const visibleIds = rows.map((r) => r.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  function toggleAllVisible() {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...visibleIds]);
    });
  }

  const exportHref = `/api/console/webinars/${webinar.id}/registrations/export?${buildQuery({}).toString()}`;

  const registrationsByBroadcast = rows.reduce<Record<string, Row[]>>((groups, row) => {
    const key = row.session_start_at ? new Date(row.session_start_at).toISOString() : "unscheduled";
    (groups[key] ||= []).push(row);
    return groups;
  }, {});

  return <div>
    {dialog}
    <Link href="/console/webinars" className="text-sm text-ink-soft hover:text-ink">Back to webinars</Link>
    <div className="mt-5">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-soft">Attendee management</p>
      <h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{webinar.title}</h1>
    </div>
    <ConsoleWebinarTabs webinarId={webinar.id} active="registrations" />

    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-line p-4"><p className="font-display text-2xl font-semibold">{summary.total}</p><p className="text-xs text-ink-soft">Registrations</p></div>
      <div className="rounded-2xl border border-line p-4"><p className="font-display text-2xl font-semibold">{summary.attended}</p><p className="text-xs text-ink-soft">Attended</p></div>
      <div className="rounded-2xl border border-line p-4"><p className="font-display text-2xl font-semibold">{summary.completed}</p><p className="text-xs text-ink-soft">Completed</p></div>
    </div>

    {broadcasts.length > 0 && (
      <div className="mt-6">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-soft">Who signed up for which broadcast</p>
        <p className="mt-1 text-sm text-ink-soft">Registrants keep the seat they reserved even after the schedule changes &mdash; see who&apos;s where, and clear out old broadcasts here.</p>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="border-b border-line bg-paper-soft text-ink-soft">
              <tr><th className="p-3 font-medium">Broadcast time</th><th className="p-3 font-medium">Registered</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium"></th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {broadcasts.map((b) => {
                const isActive = filters.session === b.session_start_at;
                return (
                  <tr key={b.session_start_at} className={isActive ? "bg-paper-soft" : undefined}>
                    <td className="p-3">{formatWebinarSessionWindow(b.session_start_at, Number(webinar.duration_seconds || 0), "Asia/Kolkata")}</td>
                    <td className="p-3 text-ink-soft">{b.total} registered &middot; {b.attended} attended &middot; {b.completed} completed</td>
                    <td className="p-3">
                      {!b.isFuture ? (
                        <span className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-soft">Past broadcast</span>
                      ) : b.offered ? (
                        <span className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-soft">Matches current schedule</span>
                      ) : (
                        <span className="rounded-full border border-red-600 px-2.5 py-1 text-xs font-medium text-red-600">Not in current schedule</span>
                      )}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => applySearch({ session: isActive ? "" : b.session_start_at })} className="text-xs font-medium text-ink underline">
                        {isActive ? "Clear filter" : "View"}
                      </button>
                      <button type="button" disabled={busy} onClick={() => handleDeleteBroadcast(b)} className="ml-4 text-xs font-medium text-red-600 underline disabled:opacity-40">
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    )}

    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") applySearch({ q }); }}
        onBlur={() => { if (q !== filters.q) applySearch({ q }); }}
        placeholder="Search name or email…"
        className="w-full max-w-xs rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink"
      />
      <div className="flex items-center gap-3">
        {filters.session && (
          <button type="button" onClick={() => applySearch({ session: "" })} className="text-xs font-medium text-ink-soft underline hover:text-ink">
            Clear broadcast filter
          </button>
        )}
        <a href={exportHref} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-soft hover:border-ink hover:text-ink">
          Export CSV
        </a>
      </div>
    </div>

    {selected.size > 0 && (
      <div className="mt-3 flex items-center justify-between rounded-xl border border-line bg-paper-soft px-4 py-2.5 text-sm">
        <span>{selected.size} selected</span>
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => setSelected(new Set())} className="text-xs font-medium text-ink-soft underline hover:text-ink">Clear selection</button>
          <button type="button" disabled={busy} onClick={handleDeleteSelected} className="text-xs font-medium text-red-600 underline disabled:opacity-40">Delete selected</button>
        </div>
      </div>
    )}
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}

    <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-paper">
      <table className="min-w-[720px] w-full text-left text-sm">
        <thead className="border-b border-line bg-paper-soft text-ink-soft">
          <tr>
            <th className="w-10 p-4"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all on this page" /></th>
            <th className="p-4 font-semibold">Attendee</th>
            <th className="p-4 font-semibold">Timezone</th>
            <th className="p-4 font-semibold">Status</th>
            <th className="p-4 font-semibold">Watch time</th>
            <th className="p-4 font-semibold"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {Object.entries(registrationsByBroadcast).map(([broadcast, groupRows]) => (
            <Fragment key={broadcast}>
              <tr className="bg-paper-soft">
                <th colSpan={6} className="p-3 text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">
                  {broadcast === "unscheduled" ? "Legacy registrations" : formatWebinarSessionWindow(broadcast, Number(webinar.duration_seconds || 0), "Asia/Kolkata")}
                </th>
              </tr>
              {groupRows.map((row) => {
                const status = attendanceStatus(row);
                return (
                  <tr key={row.id}>
                    <td className="p-4"><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)} aria-label={`Select ${row.name || row.email || "attendee"}`} /></td>
                    <td className="p-4"><p className="font-medium">{row.name || "Unknown attendee"}</p><p className="mt-1 text-xs text-ink-soft">{row.email || "No email"}</p></td>
                    <td className="p-4 text-ink-soft">{row.attendee_timezone || "UTC"}</td>
                    <td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status === "Left early" || status === "Missed" ? "bg-red-600 text-paper" : "bg-ink text-paper"}`}>{status}</span></td>
                    <td className="p-4 text-ink-soft">{Number(row.watch_seconds || 0) > 0 ? `${Math.floor(Number(row.watch_seconds) / 60)}m ${Number(row.watch_seconds) % 60}s` : "Not watched"}</td>
                    <td className="p-4 text-right">
                      <button type="button" disabled={busy} onClick={async () => { const ok = await confirm({ message: `Delete ${row.name || row.email || "this"}'s registration? This is permanent.` }); if (ok) await deleteRegistrations({ ids: [row.id] }); }} className="text-xs font-medium text-red-600 underline disabled:opacity-40">
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
          {!rows.length && <tr><td colSpan={6} className="p-10 text-center text-ink-soft">No registrations match these filters.</td></tr>}
        </tbody>
      </table>
    </div>

    {pagination.totalPages > 1 && (
      <div className="mt-4 flex items-center justify-between text-sm text-ink-soft">
        <span>Page {pagination.page} of {pagination.totalPages} &middot; showing {rows.length} of {pagination.totalCount}</span>
        <div className="flex gap-2">
          <button type="button" disabled={pagination.page <= 1} onClick={() => goToPage(pagination.page - 1)} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink disabled:opacity-40">Previous</button>
          <button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => goToPage(pagination.page + 1)} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink disabled:opacity-40">Next</button>
        </div>
      </div>
    )}
  </div>;
}
