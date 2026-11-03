"use client";

import { useEffect, useRef, useState } from "react";
import BrandSelect from "@/components/BrandSelect";
import { useConfirm } from "@/components/ConfirmDialog";
import GuideRichTextEditor from "@/components/GuideRichTextEditor";
import { escapeHtml } from "@/lib/escapeHtml";
import type { GuideEditorPrompt, GuideEditorSkill, GuideEditorCategory, GuideStepAttrs, NewLibraryItemInput } from "@/components/guideEditorContext";

type Category = GuideEditorCategory & { slug: string };

type Guide = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  video_url: string | null;
  body: string | null;
  status: string;
  item_count: number;
};

type LegacyGuideItem = {
  item_type: "prompt" | "skill";
  prompt_id: number | null;
  skill_id: number | null;
  timestamp_label: string | null;
  instruction: string | null;
};

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

const emptyForm = {
  title: "",
  description: "",
  video_url: "",
  body: "",
  status: "draft",
};

// Guide bodies written before the rich editor existed are plain text --
// feed those into Tiptap as one giant paragraph and the blank lines that
// used to separate paragraphs are lost, so pre-wrap them into real <p>
// tags first. Anything that already looks like HTML (every guide saved
// through the rich editor from now on) passes through untouched.
function plainTextToHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  return trimmed
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

// Guides saved under the old separate-steps editor have their items in
// prompt_guide_items but no step nodes in the body yet -- append them as
// step markers the very first time the guide is reopened here, so nothing
// is lost and the guide self-migrates to the unified format on next save.
function legacyItemsToStepMarkers(items: LegacyGuideItem[]): string {
  return items
    .map((i) => {
      const refId = i.item_type === "prompt" ? i.prompt_id : i.skill_id;
      return `<div data-guide-step="" data-item-type="${i.item_type}" data-ref-id="${refId ?? ""}" data-timestamp="${escapeHtml(i.timestamp_label || "")}" data-instruction="${encodeURIComponent(i.instruction || "")}"></div>`;
    })
    .join("");
}

export default function ConsoleGuideItems() {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [prompts, setPrompts] = useState<GuideEditorPrompt[]>([]);
  const [skills, setSkills] = useState<GuideEditorSkill[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [steps, setSteps] = useState<GuideStepAttrs[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { confirm, dialog } = useConfirm();
  const mountedRef = useRef(true);

  async function load() {
    const [guidesRes, promptsRes, skillsRes, categoriesRes] = await Promise.all([
      fetch("/api/console/prompt-library/guides"),
      fetch("/api/console/prompt-library/prompts"),
      fetch("/api/console/prompt-library/skills"),
      fetch("/api/console/prompt-library/categories"),
    ]);
    const guidesBody = await guidesRes.json();
    const promptsBody = await promptsRes.json();
    const skillsBody = await skillsRes.json();
    const categoriesBody = await categoriesRes.json();
    if (!mountedRef.current) return;
    setGuides(guidesBody.guides || []);
    setPrompts(promptsBody.prompts || []);
    setSkills(skillsBody.skills || []);
    setCategories(categoriesBody.categories || []);
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
    setSteps([]);
  }

  async function startEdit(g: Guide) {
    setEditingId(g.id);
    let body = plainTextToHtml(g.body || "");
    if (!body.includes('data-guide-step=""')) {
      const res = await fetch(`/api/console/prompt-library/guides/${g.id}/items`);
      const itemsBody = await res.json();
      const legacyItems: LegacyGuideItem[] = itemsBody.items || [];
      if (legacyItems.length > 0) body += legacyItemsToStepMarkers(legacyItems);
    }
    setForm({
      title: g.title,
      description: g.description || "",
      video_url: g.video_url || "",
      body,
      status: g.status,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (steps.some((s) => s.refId === null)) {
      setError("Every step needs a prompt or skill attached (or removed) before saving.");
      return;
    }
    setSaving(true);

    const payload = {
      ...form,
      items: steps.map((s) => ({
        item_type: s.itemType,
        prompt_id: s.itemType === "prompt" ? s.refId : null,
        skill_id: s.itemType === "skill" ? s.refId : null,
        timestamp_label: s.timestampLabel,
        instruction: s.instruction,
      })),
    };

    const res = await fetch(
      editingId ? `/api/console/prompt-library/guides/${editingId}` : "/api/console/prompt-library/guides",
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
      if (!editingId && body.guide?.id) {
        setEditingId(body.guide.id);
      }
      load();
    }
    setSaving(false);
  }

  async function handleDelete(g: Guide) {
    const ok = await confirm({ message: `Delete the guide "${g.title}"? This can't be undone.` });
    if (!ok) return;
    await fetch(`/api/console/prompt-library/guides/${g.id}`, { method: "DELETE" });
    if (editingId === g.id) resetForm();
    load();
  }

  async function handlePublish(g: Guide) {
    await fetch(`/api/console/prompt-library/guides/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "published" }),
    });
    load();
  }

  async function handleCreateItem(itemType: "prompt" | "skill", data: NewLibraryItemInput) {
    const res = await fetch(`/api/console/prompt-library/${itemType === "prompt" ? "prompts" : "skills"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: data.title,
        category_id: data.category_id,
        [itemType === "prompt" ? "prompt_text" : "skill_markdown"]: data.text,
        status: "published",
        show_in_library: data.show_in_library,
      }),
    });
    const body = await res.json();
    if (!res.ok) return { error: body.error || "Something went wrong." };
    load();
    const created = itemType === "prompt" ? body.prompt : body.skill;
    return { id: created.id, title: data.title };
  }

  async function handleToggleLibrary(itemType: "prompt" | "skill", id: number) {
    const list = itemType === "prompt" ? prompts : skills;
    const current = list.find((i) => i.id === id);
    await fetch(`/api/console/prompt-library/${itemType === "prompt" ? "prompts" : "skills"}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ show_in_library: !current?.show_in_library }),
    });
    load();
  }

  return (
    <div>
      <p className="mb-4 text-sm text-ink-soft">
        A guide is a blog-style page for one specific YouTube video or public post. Everything lives
        in the one editor below: write the explanation, and use &quot;+ Insert step&quot; wherever a
        prompt or skill belongs in the flow -- each step carries its own timestamp, instruction, and
        either an existing prompt/skill or a brand new one created right there. Share the guide&apos;s
        own link in the video description or post, it&apos;s separate from the general browse library.
      </p>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-line p-6">
        <p className="font-display text-lg font-semibold">{editingId ? "Edit guide" : "Add a guide"}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            placeholder="Guide title (e.g. AI Product Shots — YouTube tutorial)"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink sm:col-span-2"
          />
          <textarea
            placeholder="Excerpt: one or two sentences shown under the title, and used as the meta description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink sm:col-span-2"
          />
          <input
            placeholder="YouTube URL (optional)"
            value={form.video_url}
            onChange={(e) => setForm((f) => ({ ...f, video_url: e.target.value }))}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
          />
          <BrandSelect
            value={form.status}
            onChange={(v) => setForm((f) => ({ ...f, status: v }))}
            options={STATUS_OPTIONS}
          />
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-sm font-medium">Write-up</p>
          <GuideRichTextEditor
            value={form.body}
            onChange={(html) => setForm((f) => ({ ...f, body: html }))}
            onStepsChange={setSteps}
            prompts={prompts}
            skills={skills}
            categories={categories}
            onCreateItem={handleCreateItem}
            onToggleLibrary={handleToggleLibrary}
          />
          <p className="mt-1.5 text-xs text-ink-soft">
            The actual article content, plus every step, all in one place. The more real explanation you write, the more useful the page is for readers and for search.
          </p>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {saving ? "Saving..." : editingId ? "Save changes" : "Create guide"}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-sm text-ink-soft hover:text-ink">
              Done editing
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </form>

      <div className="mt-8 space-y-2">
        {guides.length === 0 && <p className="text-sm text-ink-soft">No guides yet.</p>}
        {guides.map((g) => (
          <div key={g.id} className="flex items-center gap-3 rounded-xl border border-line bg-paper p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {g.title} <span className="text-xs font-normal text-ink-soft">{g.item_count} step{g.item_count === 1 ? "" : "s"}</span>
              </p>
              {g.status === "published" && (
                <p className="truncate text-xs text-ink-soft">/resources/prompt-skill-library/guides/{g.slug}</p>
              )}
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                g.status === "published" ? "bg-green-100 text-green-700" : "bg-paper-soft text-ink-soft"
              }`}
            >
              {g.status}
            </span>
            {g.status !== "published" && (
              <button onClick={() => handlePublish(g)} className="shrink-0 text-xs font-medium text-ink hover:underline">
                Publish
              </button>
            )}
            <button onClick={() => startEdit(g)} className="shrink-0 text-xs font-medium text-ink hover:underline">
              Edit
            </button>
            <button onClick={() => handleDelete(g)} className="shrink-0 text-xs font-medium text-red-600 hover:underline">
              Delete
            </button>
          </div>
        ))}
      </div>
      {dialog}
    </div>
  );
}
