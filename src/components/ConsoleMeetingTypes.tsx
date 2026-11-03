"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ConsoleModal from "@/components/ConsoleModal";
import ConsoleMeetingsTabs from "@/components/ConsoleMeetingsTabs";

type MeetingType = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  calcom_event_type_id: string;
  active: boolean;
  booking_count: number;
};

type FormState = {
  name: string;
  slug: string;
  description: string;
  duration_minutes: string;
  minimum_booking_notice: string;
  before_event_buffer: string;
  after_event_buffer: string;
};

const EMPTY_FORM: FormState = { name: "", slug: "", description: "", duration_minutes: "15", minimum_booking_notice: "120", before_event_buffer: "0", after_event_buffer: "0" };

const inputClass = "mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink";
const labelClass = "text-xs font-medium text-ink-soft";

export default function ConsoleMeetingTypes({ types }: { types: MeetingType[] }) {
  const router = useRouter();
  const [list, setList] = useState(types);
  // Keeps the list in sync after router.refresh() re-fetches the server
  // component's data following a create/edit -- list is otherwise a local
  // fork of the `types` prop (needed for toggleActive's optimistic update),
  // so it doesn't pick up new props on its own.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setList(types);
  }, [types]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<MeetingType | null>(null);

  function openCreate() {
    setForm(EMPTY_FORM);
    setError("");
    setCreating(true);
  }

  async function openEdit(type: MeetingType) {
    setError("");
    setEditingId(type.id);
    setForm({
      name: type.name,
      slug: type.slug,
      description: type.description || "",
      duration_minutes: String(type.duration_minutes),
      minimum_booking_notice: "",
      before_event_buffer: "",
      after_event_buffer: "",
    });
    try {
      const res = await fetch(`/api/console/meetings/types/${type.id}`);
      const body = await res.json();
      if (res.ok && body.calcom) {
        setForm((f) => ({
          ...f,
          minimum_booking_notice: String(body.calcom.minimumBookingNotice ?? 0),
          before_event_buffer: String(body.calcom.beforeEventBuffer ?? 0),
          after_event_buffer: String(body.calcom.afterEventBuffer ?? 0),
        }));
      }
    } catch {
      // Non-fatal -- the form still works with just name/description/duration.
    }
  }

  function closeModal() {
    setCreating(false);
    setEditingId(null);
    setError("");
  }

  async function submitCreate() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/console/meetings/types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          description: form.description,
          duration_minutes: Number(form.duration_minutes),
          minimum_booking_notice: Number(form.minimum_booking_notice),
          before_event_buffer: Number(form.before_event_buffer),
          after_event_buffer: Number(form.after_event_buffer),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) { setError(body?.error || "Could not create the meeting type."); return; }
      closeModal();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit() {
    if (!editingId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/console/meetings/types/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          duration_minutes: Number(form.duration_minutes),
          minimum_booking_notice: Number(form.minimum_booking_notice),
          before_event_buffer: Number(form.before_event_buffer),
          after_event_buffer: Number(form.after_event_buffer),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) { setError(body?.error || "Could not save changes."); return; }
      closeModal();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(type: MeetingType) {
    setList((l) => l.map((t) => (t.id === type.id ? { ...t, active: !t.active } : t)));
    const res = await fetch(`/api/console/meetings/types/${type.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !type.active }),
    });
    if (!res.ok) setList((l) => l.map((t) => (t.id === type.id ? { ...t, active: type.active } : t)));
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const res = await fetch(`/api/console/meetings/types/${confirmDelete.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error || "Could not delete."); setConfirmDelete(null); return; }
    setList((l) => l.filter((t) => t.id !== confirmDelete.id));
    setConfirmDelete(null);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Meetings</h1>
          <p className="mt-2 text-sm text-ink-soft">Create and configure meeting types, synced to your booking calendar automatically.</p>
        </div>
        <button type="button" onClick={openCreate} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80">
          New meeting type
        </button>
      </div>
      <div className="mt-6"><ConsoleMeetingsTabs /></div>

      {error && !creating && editingId === null && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-paper">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b border-line text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Duration</th>
              <th className="px-4 py-3 font-medium">Bookings</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {list.map((type) => (
              <tr key={type.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">{type.name}</td>
                <td className="px-4 py-3 text-ink-soft">/book/{type.slug}</td>
                <td className="px-4 py-3 text-ink-soft">{type.duration_minutes} min</td>
                <td className="px-4 py-3 text-ink-soft">{type.booking_count}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleActive(type)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${type.active ? "border-ink bg-ink text-paper" : "border-line text-ink-soft"}`}
                  >
                    {type.active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => openEdit(type)} className="rounded-full border border-line px-3 py-1 text-xs font-medium hover:border-ink">
                      Edit
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(type)} className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:border-red-500">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-soft">No meeting types yet. Create one to start taking bookings.</td></tr>}
          </tbody>
        </table>
      </div>

      {(creating || editingId !== null) && (
        <ConsoleModal title={creating ? "New meeting type" : "Edit meeting type"} onClose={closeModal}>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Name</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} />
            </div>
            {creating && (
              <div>
                <label className={labelClass}>URL slug (used at /book/&lt;slug&gt;)</label>
                <input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))} placeholder="e.g. strategy-call" className={inputClass} />
              </div>
            )}
            <div>
              <label className={labelClass}>Description</label>
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Duration (minutes)</label>
                <input type="number" min={5} max={480} value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Minimum notice (minutes)</label>
                <input type="number" min={0} value={form.minimum_booking_notice} onChange={(e) => setForm((f) => ({ ...f, minimum_booking_notice: e.target.value }))} className={inputClass} />
                <p className="mt-1 text-xs text-ink-soft">How soon before a slot someone can still book it.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Buffer before (minutes)</label>
                <input type="number" min={0} value={form.before_event_buffer} onChange={(e) => setForm((f) => ({ ...f, before_event_buffer: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Buffer after (minutes)</label>
                <input type="number" min={0} value={form.after_event_buffer} onChange={(e) => setForm((f) => ({ ...f, after_event_buffer: e.target.value }))} className={inputClass} />
              </div>
            </div>
            <p className="text-xs text-ink-soft">
              Which days/hours you&apos;re generally bookable is managed from the Availability tab.
              This controls this specific meeting type&apos;s length and buffers on top of that.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={closeModal} className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink">
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !form.name.trim() || (creating && !/^[a-z0-9][a-z0-9-]*$/.test(form.slug))}
              onClick={creating ? submitCreate : submitEdit}
              className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {busy ? "Saving…" : creating ? "Create" : "Save changes"}
            </button>
          </div>
        </ConsoleModal>
      )}

      {confirmDelete && (
        <ConsoleModal title="Delete meeting type?" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-ink-soft">
            {confirmDelete.booking_count > 0
              ? `This has ${confirmDelete.booking_count} existing booking${confirmDelete.booking_count === 1 ? "" : "s"} and can't be deleted. Deactivate it instead so it stops accepting new bookings.`
              : `This removes "${confirmDelete.name}" and its associated event type. This can't be undone.`}
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink">
              Cancel
            </button>
            {confirmDelete.booking_count === 0 && (
              <button type="button" onClick={handleDelete} className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80">
                Delete
              </button>
            )}
          </div>
        </ConsoleModal>
      )}
    </div>
  );
}
