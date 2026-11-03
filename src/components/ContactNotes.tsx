"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";

type Note = { id: number; body: string; created_by: string; created_at: string };

export default function ContactNotes({ userId, notes }: { userId: number; notes: Note[] }) {
  const [list, setList] = useState(notes);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  async function addNote() {
    if (!body.trim()) return;
    setBusy(true);
    const res = await fetch("/api/console/contacts/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, body }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.note) {
      setList((l) => [data.note, ...l]);
      setBody("");
    }
    setBusy(false);
  }

  async function removeNote(id: number) {
    const ok = await confirm({ message: "Delete this note? This can't be undone." });
    if (!ok) return;
    const res = await fetch(`/api/console/contacts/notes/${id}`, { method: "DELETE" });
    if (res.ok) setList((l) => l.filter((n) => n.id !== id));
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add an internal note…"
          className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <button
          onClick={addNote}
          disabled={busy || !body.trim()}
          className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {list.length === 0 && <p className="text-sm text-ink-soft">No notes yet.</p>}
        {list.map((n) => (
          <div key={n.id} className="rounded-lg bg-paper-soft px-3 py-2">
            <p className="whitespace-pre-wrap text-sm">{n.body}</p>
            <div className="mt-1 flex items-center justify-between text-xs text-ink-soft">
              <span>
                {n.created_by} · {new Date(n.created_at).toLocaleString()}
              </span>
              <button
                onClick={() => removeNote(n.id)}
                className="rounded-full border border-red-600 px-2.5 py-1 font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      {dialog}
    </div>
  );
}
