"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RichTextEditor from "@/components/RichTextEditor";
import { useConfirm } from "@/components/ConfirmDialog";
import { TEMPLATE_VARIABLES } from "@/lib/messageVariables";
import type { EmailContentTemplate } from "@/lib/emailContentTemplates";

function SubjectVariableButtons({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-xs text-ink-soft">Insert:</span>
      {TEMPLATE_VARIABLES.map((variable) => (
        <button
          key={variable.token}
          type="button"
          onClick={() => onInsert(variable.token)}
          className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft transition-colors hover:border-ink"
        >
          {variable.label}
        </button>
      ))}
    </div>
  );
}

function TemplateForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial: EmailContentTemplate | null;
  onSaved: (template: EmailContentTemplate) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [subject, setSubject] = useState(initial?.subject || "");
  const [bodyHtml, setBodyHtml] = useState(initial?.body_html || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    const url = initial ? `/api/console/email/content-templates/${initial.id}` : "/api/console/email/content-templates";
    const res = await fetch(url, {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, subject, bodyHtml }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(body.error || "Could not save this template.");
      return;
    }
    onSaved(body.template);
  }

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-paper p-5">
      <div>
        <label className="text-sm font-medium">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Course check-in, Re-engagement nudge"
          maxLength={120}
          className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <p className="mt-1 text-xs text-ink-soft">For your own reference only — not shown to recipients.</p>
      </div>

      <div>
        <label className="text-sm font-medium">Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <SubjectVariableButtons onInsert={(token) => setSubject((current) => `${current}{{${token}}}`)} />
      </div>

      <div>
        <label className="text-sm font-medium">Content</label>
        <div className="mt-1">
          <RichTextEditor value={bodyHtml} variables={TEMPLATE_VARIABLES} onChange={setBodyHtml} />
        </div>
        <p className="mt-1.5 text-xs text-ink-soft">
          course_title/course_url only fill in where a course is actually in context (an automation step on a course
          trigger). Elsewhere they&apos;re left blank.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !name.trim()}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save template"}
        </button>
      </div>
    </div>
  );
}

export default function ConsoleEmailLibrary({ templates }: { templates: EmailContentTemplate[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const { confirm, dialog } = useConfirm();

  async function handleDelete(template: EmailContentTemplate) {
    const ok = await confirm({ message: `Delete the template "${template.name}"? This can't be undone.` });
    if (!ok) return;
    await fetch(`/api/console/email/content-templates/${template.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      {dialog}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Templates ({templates.length})</h2>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80"
          >
            New template
          </button>
        )}
      </div>

      {creating && (
        <div className="mt-4">
          <TemplateForm
            initial={null}
            onCancel={() => setCreating(false)}
            onSaved={() => {
              setCreating(false);
              router.refresh();
            }}
          />
        </div>
      )}

      {!templates.length && !creating && (
        <p className="mt-6 text-sm text-ink-soft">No templates yet. Create one to reuse it in campaigns, automation, and contact emails.</p>
      )}

      <div className="mt-6 space-y-3">
        {templates.map((template) => {
          const isEditing = editingId === template.id;
          return (
            <div key={template.id} className="rounded-2xl border border-line bg-paper p-5">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setEditingId(isEditing ? null : template.id)}
                  className="flex-1 text-left"
                >
                  <p className="font-medium">{template.name}</p>
                  <p className="mt-1 text-xs text-ink-soft">{template.subject || "No subject set"}</p>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(isEditing ? null : template.id)}
                    className="text-sm text-ink-soft hover:text-ink"
                  >
                    {isEditing ? "Close" : "Edit"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(template)}
                    className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {isEditing && (
                <div className="mt-4 border-t border-line pt-4">
                  <TemplateForm
                    initial={template}
                    onCancel={() => setEditingId(null)}
                    onSaved={() => {
                      setEditingId(null);
                      router.refresh();
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
