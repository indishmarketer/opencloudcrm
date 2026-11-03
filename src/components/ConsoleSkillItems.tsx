"use client";

import { useEffect, useRef, useState } from "react";
import BrandSelect from "@/components/BrandSelect";
import { useConfirm } from "@/components/ConfirmDialog";
import { SKILL_TEMPLATE } from "@/lib/promptLibrary";

type Category = { id: number; slug: string; name: string };

type Skill = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  skill_markdown: string;
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
  skill_markdown: "",
  category_id: "",
  status: "draft",
  show_in_library: true,
};

export default function ConsoleSkillItems() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { confirm, dialog } = useConfirm();
  const mountedRef = useRef(true);

  async function load() {
    const [skillsRes, categoriesRes] = await Promise.all([
      fetch("/api/console/prompt-library/skills"),
      fetch("/api/console/prompt-library/categories"),
    ]);
    const skillsBody = await skillsRes.json();
    const categoriesBody = await categoriesRes.json();
    if (!mountedRef.current) return;
    setSkills(skillsBody.skills || []);
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

  function startEdit(s: Skill) {
    setEditingId(s.id);
    setForm({
      title: s.title,
      description: s.description || "",
      skill_markdown: s.skill_markdown,
      category_id: String(s.category_id),
      status: s.status,
      show_in_library: s.show_in_library,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function useTemplate() {
    setForm((f) => ({ ...f, skill_markdown: SKILL_TEMPLATE }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = { ...form, category_id: Number(form.category_id) };

    const res = await fetch(
      editingId ? `/api/console/prompt-library/skills/${editingId}` : "/api/console/prompt-library/skills",
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

  async function handleDelete(s: Skill) {
    const ok = await confirm({ message: `Delete "${s.title}" from the skill library? This can't be undone.` });
    if (!ok) return;
    await fetch(`/api/console/prompt-library/skills/${s.id}`, { method: "DELETE" });
    load();
  }

  async function handlePublish(s: Skill) {
    await fetch(`/api/console/prompt-library/skills/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "published" }),
    });
    load();
  }

  async function handleToggleLibrary(s: Skill) {
    await fetch(`/api/console/prompt-library/skills/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ show_in_library: !s.show_in_library }),
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-lg font-semibold">{editingId ? "Edit skill" : "Add a skill"}</p>
          <button
            type="button"
            onClick={useTemplate}
            className="text-xs font-medium text-ink-soft underline hover:text-ink"
          >
            Start from template
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            placeholder="Skill title"
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
            placeholder="The skill's markdown content (a SKILL.md-style file)"
            value={form.skill_markdown}
            onChange={(e) => setForm((f) => ({ ...f, skill_markdown: e.target.value }))}
            required
            rows={12}
            className="rounded-lg border border-line bg-paper px-3 py-2 font-mono text-xs outline-none focus:border-ink sm:col-span-2"
          />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.show_in_library}
              onChange={(e) => setForm((f) => ({ ...f, show_in_library: e.target.checked }))}
              className="h-4 w-4 rounded border-line"
            />
            Show in the public Prompt &amp; Skill Library grid (turn off for a skill that only makes sense inside a specific guide)
          </label>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <button
            type="submit"
            disabled={saving || categories.length === 0}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {saving ? "Saving..." : editingId ? "Save changes" : "Add skill"}
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
        {skills.length === 0 && <p className="text-sm text-ink-soft">No skills yet.</p>}
        {skills.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-xl border border-line bg-paper p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {s.title} <span className="text-xs font-normal text-ink-soft">{s.category_name}</span>
              </p>
              {s.description && <p className="truncate text-xs text-ink-soft">{s.description}</p>}
            </div>
            <button
              onClick={() => handleToggleLibrary(s)}
              title="Click to toggle"
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                s.show_in_library ? "bg-blue-100 text-blue-700" : "bg-paper-soft text-ink-soft"
              }`}
            >
              {s.show_in_library ? "In library" : "Guide-only"}
            </button>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                s.status === "published" ? "bg-green-100 text-green-700" : "bg-paper-soft text-ink-soft"
              }`}
            >
              {s.status}
            </span>
            {s.status !== "published" && (
              <button onClick={() => handlePublish(s)} className="shrink-0 text-xs font-medium text-ink hover:underline">
                Publish
              </button>
            )}
            <button onClick={() => startEdit(s)} className="shrink-0 text-xs font-medium text-ink hover:underline">
              Edit
            </button>
            <button onClick={() => handleDelete(s)} className="shrink-0 text-xs font-medium text-red-600 hover:underline">
              Delete
            </button>
          </div>
        ))}
      </div>
      {dialog}
    </div>
  );
}
