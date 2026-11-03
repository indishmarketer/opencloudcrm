"use client";

import { useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";

type Category = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  prompt_count: number;
  skill_count: number;
};

export default function ConsolePromptCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const { confirm, dialog } = useConfirm();
  const mountedRef = useRef(true);

  async function load() {
    const res = await fetch("/api/console/prompt-library/categories");
    const body = await res.json();
    if (!mountedRef.current) return;
    setCategories(body.categories || []);
  }

  useEffect(() => {
    load();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch("/api/console/prompt-library/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: description || undefined }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Something went wrong.");
    } else {
      setName("");
      setDescription("");
      load();
    }
    setSaving(false);
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditDescription(cat.description || "");
  }

  async function handleEditSave(id: number) {
    setEditSaving(true);
    setError("");
    const res = await fetch(`/api/console/prompt-library/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, description: editDescription || null }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Something went wrong.");
    } else {
      setEditingId(null);
      load();
    }
    setEditSaving(false);
  }

  async function handleDelete(cat: Category) {
    const total = cat.prompt_count + cat.skill_count;
    const message =
      total > 0
        ? `Delete "${cat.name}"? This also deletes the ${cat.prompt_count} prompt(s) and ${cat.skill_count} skill(s) in it. This can't be undone.`
        : `Delete the category "${cat.name}"? This can't be undone.`;
    const ok = await confirm({ message });
    if (!ok) return;
    await fetch(`/api/console/prompt-library/categories/${cat.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <form onSubmit={handleAdd} className="grid gap-3 rounded-2xl border border-line p-6 sm:grid-cols-[1fr_2fr_auto]">
        <input
          placeholder="Category name (e.g. Images)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <input
          placeholder="Short description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {saving ? "Adding..." : "Add category"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.length === 0 && (
          <p className="text-sm text-ink-soft">No categories yet. Add your first one above.</p>
        )}
        {categories.map((c) =>
          editingId === c.id ? (
            <div key={c.id} className="flex flex-col gap-2 rounded-2xl border border-ink bg-paper p-4">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
              />
              <input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Short description (optional)"
                className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
              />
              <div className="mt-1 flex gap-2">
                <button
                  onClick={() => handleEditSave(c.id)}
                  disabled={editSaving}
                  className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
                >
                  {editSaving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-soft hover:border-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div key={c.id} className="flex items-start justify-between gap-3 rounded-2xl border border-line bg-paper p-4">
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold">{c.name}</p>
                {c.description && <p className="mt-1 text-xs text-ink-soft">{c.description}</p>}
                <p className="mt-2 text-xs uppercase tracking-wide text-ink-soft">
                  {c.prompt_count} prompt{c.prompt_count === 1 ? "" : "s"} &middot; {c.skill_count} skill{c.skill_count === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => startEdit(c)}
                  className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(c)}
                  className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-red-600 hover:text-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          )
        )}
      </div>
      {dialog}
    </div>
  );
}
