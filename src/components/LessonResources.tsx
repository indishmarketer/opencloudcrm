"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";

type Resource = { id: number; label: string; url: string };

export default function LessonResources({
  lessonId,
  resources,
  canManage,
}: {
  lessonId: number;
  resources: Resource[];
  canManage: boolean;
}) {
  const [list, setList] = useState(resources);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  if (list.length === 0 && !canManage) return null;

  function startEdit(r: Resource) {
    setEditingId(r.id);
    setLabel(r.label);
    setUrl(r.url);
    setAdding(false);
  }

  function startAdd() {
    setAdding(true);
    setEditingId(null);
    setLabel("");
    setUrl("");
  }

  function cancel() {
    setAdding(false);
    setEditingId(null);
  }

  async function save() {
    if (!label.trim() || !url.trim()) return;
    setBusy(true);
    if (editingId) {
      await fetch(`/api/console/lessons/resources/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, url }),
      });
      setList((prev) => prev.map((r) => (r.id === editingId ? { ...r, label, url } : r)));
    } else {
      const res = await fetch(`/api/console/lessons/${lessonId}/resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, url }),
      });
      const body = await res.json();
      if (res.ok) setList((prev) => [...prev, body.resource]);
    }
    setBusy(false);
    cancel();
  }

  async function remove(id: number) {
    const ok = await confirm({ message: "Remove this resource?" });
    if (!ok) return;
    setBusy(true);
    await fetch(`/api/console/lessons/resources/${id}`, { method: "DELETE" });
    setList((prev) => prev.filter((r) => r.id !== id));
    setBusy(false);
  }

  return (
    <div className="mt-6 rounded-2xl border border-line bg-paper p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Resources</h2>
        {canManage && !adding && (
          <button
            type="button"
            onClick={startAdd}
            className="text-xs font-medium text-ink-soft underline hover:text-ink"
          >
            + Add resource
          </button>
        )}
      </div>

      {list.length === 0 && !adding && (
        <p className="mt-2 text-sm text-ink-soft">No resources for this lesson yet.</p>
      )}

      <ul className="mt-3 space-y-2">
        {list.map((r) =>
          editingId === r.id ? (
            <li key={r.id} className="flex flex-wrap gap-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label"
                className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
              />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                className="min-w-0 flex-[2] rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
              />
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-paper disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={cancel}
                className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink"
              >
                Cancel
              </button>
            </li>
          ) : (
            <li key={r.id} className="flex items-center justify-between gap-3">
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm font-medium text-ink underline hover:opacity-80"
              >
                {r.label}
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
              {canManage && (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(r)}
                    className="text-xs font-medium text-ink-soft underline hover:text-ink"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(r.id)}
                    disabled={busy}
                    className="text-xs font-medium text-red-600 underline hover:text-red-700 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          )
        )}
      </ul>

      {adding && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. Slide deck PDF)"
            className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="min-w-0 flex-[2] rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
          />
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-paper disabled:opacity-50"
          >
            Add
          </button>
          <button
            type="button"
            onClick={cancel}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink"
          >
            Cancel
          </button>
        </div>
      )}
      {dialog}
    </div>
  );
}
