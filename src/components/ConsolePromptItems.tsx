"use client";

import { useEffect, useRef, useState } from "react";
import BrandSelect from "@/components/BrandSelect";
import { useConfirm } from "@/components/ConfirmDialog";

type Category = { id: number; slug: string; name: string };

type Prompt = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  prompt_text: string;
  category_id: number;
  category_name: string;
  status: string;
  show_in_library: boolean;
};

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

const emptyForm = {
  title: "",
  description: "",
  prompt_text: "",
  category_id: "",
  status: "draft",
  show_in_library: true,
};

export default function ConsolePromptItems() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { confirm, dialog } = useConfirm();
  const mountedRef = useRef(true);

  async function load() {
    const [promptsRes, categoriesRes] = await Promise.all([
      fetch("/api/console/prompt-library/prompts"),
      fetch("/api/console/prompt-library/categories"),
    ]);
    const promptsBody = await promptsRes.json();
    const categoriesBody = await categoriesRes.json();
    if (!mountedRef.current) return;
    setPrompts(promptsBody.prompts || []);
    setCategories(categoriesBody.categories || []);
    setLoaded(true);
  }

  useEffect(() => {
    load();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function startEdit(p: Prompt) {
    setEditingId(p.id);
    setForm({
      title: p.title,
      description: p.description || "",
      prompt_text: p.prompt_text,
      category_id: String(p.category_id),
      status: p.status,
      show_in_library: p.show_in_library,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = { ...form, category_id: Number(form.category_id) };

    const res = await fetch(
      editingId ? `/api/console/prompt-library/prompts/${editingId}` : "/api/console/prompt-library/prompts",
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Something went wrong.");
    } else {
      resetForm();
      load();
    }
    setSaving(false);
  }

  async function handleDelete(p: Prompt) {
    const ok = await confirm({ message: `Delete "${p.title}" from the prompt library? This can't be undone.` });
    if (!ok) return;
    await fetch(`/api/console/prompt-library/prompts/${p.id}`, { method: "DELETE" });
    load();
  }

  async function handlePublish(p: Prompt) {
    await fetch(`/api/console/prompt-library/prompts/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "published" }),
    });
    load();
  }

  async function handleToggleLibrary(p: Prompt) {
    await fetch(`/api/console/prompt-library/prompts/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ show_in_library: !p.show_in_library }),
    });
    load();
  }

  const categoryOptions = categories.map((c) => ({ value: String(c.id), label: c.name }));

  return (
    <div>
      {loaded && categories.length === 0 && (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Add at least one category first, on the Categories tab.
        </p>
      )}
      <form onSubmit={handleSubmit} className="rounded-2xl border border-line p-6">
        <p className="font-display text-lg font-semibold">{editingId ? "Edit prompt" : "Add a prompt"}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            placeholder="Prompt title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink sm:col-span-2"
          />
          <BrandSelect
            value={form.category_id}
            onChange={(v) => setForm((f) => ({ ...f, category_id: v }))}
            options={categoryOptions}
            placeholder="Category"
          />
          <BrandSelect
            value={form.status}
            onChange={(v) => setForm((f) => ({ ...f, status: v }))}
            options={STATUS_OPTIONS}
          />
          <textarea
            placeholder="Short description shown in the library grid (optional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink sm:col-span-2"
          />
          <textarea
            placeholder="The actual prompt text"
            value={form.prompt_text}
            onChange={(e) => setForm((f) => ({ ...f, prompt_text: e.target.value }))}
            required
            rows={6}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink sm:col-span-2"
          />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.show_in_library}
              onChange={(e) => setForm((f) => ({ ...f, show_in_library: e.target.checked }))}
              className="h-4 w-4 rounded border-line"
            />
            Show in the public Prompt &amp; Skill Library grid (turn off for a prompt that only makes sense inside a specific guide)
          </label>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <button
            type="submit"
            disabled={saving || categories.length === 0}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {saving ? "Saving..." : editingId ? "Save changes" : "Add prompt"}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-sm text-ink-soft hover:text-ink">
              Cancel
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </form>

      <div className="mt-8 space-y-2">
        {prompts.length === 0 && <p className="text-sm text-ink-soft">No prompts yet.</p>}
        {prompts.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-paper p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {p.title} <span className="text-xs font-normal text-ink-soft">{p.category_name}</span>
              </p>
              {p.description && <p className="truncate text-xs text-ink-soft">{p.description}</p>}
            </div>
            <button
              onClick={() => handleToggleLibrary(p)}
              title="Click to toggle"
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                p.show_in_library ? "bg-blue-100 text-blue-700" : "bg-paper-soft text-ink-soft"
              }`}
            >
              {p.show_in_library ? "In library" : "Guide-only"}
            </button>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                p.status === "published" ? "bg-green-100 text-green-700" : "bg-paper-soft text-ink-soft"
              }`}
            >
              {p.status}
            </span>
            {p.status !== "published" && (
              <button onClick={() => handlePublish(p)} className="shrink-0 text-xs font-medium text-ink hover:underline">
                Publish
              </button>
            )}
            <button onClick={() => startEdit(p)} className="shrink-0 text-xs font-medium text-ink hover:underline">
              Edit
            </button>
            <button onClick={() => handleDelete(p)} className="shrink-0 text-xs font-medium text-red-600 hover:underline">
              Delete
            </button>
          </div>
        ))}
      </div>
      {dialog}
    </div>
  );
}
