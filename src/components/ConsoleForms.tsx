"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BrandSelect from "@/components/BrandSelect";
import { useConfirm } from "@/components/ConfirmDialog";
import { FORM_FIELD_TYPES, MAX_FORM_FIELDS, type FormDefinition, type FormField } from "@/lib/formsShape";

type FormRow = FormDefinition & { submissionCount: number };
type BuiltInForm = { name: string; where: string; edit: string };

const inputClass = "mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink";
const labelClass = "text-sm font-medium";

function emptyField(): FormField {
  return { key: "", label: "", type: "text", options: "", required: false };
}

function FieldsEditor({ fields, onChange }: { fields: FormField[]; onChange: (fields: FormField[]) => void }) {
  function update(index: number, patch: Partial<FormField>) {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }
  function remove(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }
  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {fields.map((field, i) => (
        <div key={i} className="rounded-xl border border-line p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1">
              <label className={labelClass}>Label</label>
              <input value={field.label} onChange={(e) => update(i, { label: e.target.value })} className={inputClass} placeholder="e.g. Your email" />
            </div>
            <div className="w-40">
              <label className={labelClass}>Type</label>
              <BrandSelect value={field.type} onChange={(v) => update(i, { type: v as FormField["type"] })} options={FORM_FIELD_TYPES} compact />
            </div>
            <label className="flex items-center gap-1.5 pb-2 text-sm">
              <input type="checkbox" checked={field.required} onChange={(e) => update(i, { required: e.target.checked })} className="h-4 w-4" />
              Required
            </label>
            <div className="flex gap-1 pb-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded-full border border-line px-2 py-1 text-xs disabled:opacity-30">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === fields.length - 1} className="rounded-full border border-line px-2 py-1 text-xs disabled:opacity-30">↓</button>
              <button type="button" onClick={() => remove(i)} className="rounded-full border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50">Remove</button>
            </div>
          </div>
          {field.type === "select" && (
            <div className="mt-2">
              <label className={labelClass}>Dropdown options (comma separated)</label>
              <input value={field.options} onChange={(e) => update(i, { options: e.target.value })} className={inputClass} placeholder="Option A, Option B, Option C" />
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...fields, emptyField()])}
        disabled={fields.length >= MAX_FORM_FIELDS}
        className="rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-ink disabled:opacity-40"
      >
        + Add field
      </button>
    </div>
  );
}

function SubmissionsPanel({ formId }: { formId: number }) {
  const [submissions, setSubmissions] = useState<{ id: number; field_values: Record<string, string>; created_at: string }[] | null>(null);

  async function load() {
    const res = await fetch(`/api/console/forms/${formId}/submissions`);
    const body = await res.json().catch(() => ({ submissions: [] }));
    setSubmissions(body.submissions || []);
  }

  if (submissions === null) {
    return (
      <button type="button" onClick={load} className="text-sm font-medium underline">
        Load submissions
      </button>
    );
  }
  if (!submissions.length) return <p className="text-sm text-ink-soft">No submissions yet.</p>;
  return (
    <div className="space-y-2 overflow-x-auto">
      {submissions.map((s) => (
        <div key={s.id} className="rounded-lg border border-line p-3 text-sm">
          <p className="text-xs text-ink-soft">{new Date(s.created_at).toLocaleString()}</p>
          {Object.entries(s.field_values).map(([key, value]) => (
            <p key={key} className="mt-1"><span className="text-ink-soft">{key}:</span> {value}</p>
          ))}
        </div>
      ))}
    </div>
  );
}

function FormEditor({ form, onClose }: { form: FormRow; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(form.name);
  const [heading, setHeading] = useState(form.heading);
  const [introText, setIntroText] = useState(form.introText);
  const [fields, setFields] = useState<FormField[]>(form.fields);
  const [submitLabel, setSubmitLabel] = useState(form.submitLabel);
  const [successHeading, setSuccessHeading] = useState(form.successHeading);
  const [successText, setSuccessText] = useState(form.successText);
  const [notifyEmail, setNotifyEmail] = useState(form.notifyEmail);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showSubmissions, setShowSubmissions] = useState(false);

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/console/forms/${form.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, heading, introText, fields, submitLabel, successHeading, successText, notifyEmail }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Could not save this form.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-4 space-y-4 border-t border-line pt-4">
      <div>
        <label className={labelClass}>Form name (internal, not shown to visitors)</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Heading (shown above the form)</label>
          <input value={heading} onChange={(e) => setHeading(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Submit button text</label>
          <input value={submitLabel} onChange={(e) => setSubmitLabel(e.target.value)} className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>Intro text</label>
        <textarea value={introText} onChange={(e) => setIntroText(e.target.value)} rows={2} className={inputClass} />
      </div>

      <div>
        <p className={labelClass}>Fields</p>
        <div className="mt-2">
          <FieldsEditor fields={fields} onChange={setFields} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Thank-you heading</label>
          <input value={successHeading} onChange={(e) => setSuccessHeading(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Notify email (optional, besides the console inbox)</label>
          <input value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} className={inputClass} placeholder="you@example.com" />
        </div>
      </div>
      <div>
        <label className={labelClass}>Thank-you text</label>
        <textarea value={successText} onChange={(e) => setSuccessText(e.target.value)} rows={2} className={inputClass} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50">
          {saving ? "Saving..." : "Save changes"}
        </button>
        <button type="button" onClick={onClose} className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink">
          Close
        </button>
        <button type="button" onClick={() => setShowSubmissions((v) => !v)} className="ml-auto text-sm font-medium underline">
          {showSubmissions ? "Hide" : "Show"} submissions ({form.submissionCount})
        </button>
      </div>
      {showSubmissions && <SubmissionsPanel formId={form.id} />}
    </div>
  );
}

export default function ConsoleForms({ forms, builtIn }: { forms: FormRow[]; builtIn: BuiltInForm[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function createForm() {
    setCreating(true);
    const res = await fetch("/api/console/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New form",
        fields: [{ label: "Your name", type: "text", required: true }, { label: "Your email", type: "email", required: true }],
      }),
    });
    setCreating(false);
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setOpenId(body.id);
      router.refresh();
    }
  }

  async function removeForm(form: FormRow) {
    const ok = await confirm({
      message: `Permanently delete "${form.name}"? Its ${form.submissionCount} submission(s) will be deleted too.`,
      confirmLabel: "Delete form",
    });
    if (!ok) return;
    setDeletingId(form.id);
    setDeleteError("");
    const res = await fetch(`/api/console/forms/${form.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setDeletingId(null);
    if (!res.ok) {
      setDeleteError(body.error || "Could not delete this form.");
      return;
    }
    if (openId === form.id) setOpenId(null);
    router.refresh();
  }

  return (
    <div>
      {dialog}
      <div className="mt-8">
        <h2 className="font-display text-lg font-semibold">Built-in forms</h2>
        <div className="mt-3 space-y-2">
          {builtIn.map((b) => (
            <div key={b.name} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3">
              <div>
                <p className="text-sm font-medium">{b.name}</p>
                <p className="text-xs text-ink-soft">{b.where}</p>
              </div>
              <a href={b.edit} className="text-sm font-medium underline">Edit</a>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Your forms</h2>
          <button type="button" onClick={createForm} disabled={creating} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50">
            {creating ? "Creating..." : "+ Create form"}
          </button>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Place a form as a page section (Form block, &ldquo;A saved form&rdquo; type) or open it as a popup from any
          Hero/Call-to-action button (&ldquo;A saved form, as a popup&rdquo;).
        </p>
        {deleteError && <p role="alert" className="mt-3 text-sm text-red-600">{deleteError}</p>}
        {!forms.length && <p className="mt-4 text-sm text-ink-soft">No forms yet.</p>}
        <div className="mt-4 space-y-3">
          {forms.map((form) => {
            const isOpen = openId === form.id;
            return (
              <div key={form.id} className="rounded-2xl border border-line bg-paper p-5">
                <button type="button" onClick={() => setOpenId(isOpen ? null : form.id)} className="flex w-full items-center justify-between gap-3 text-left">
                  <div>
                    <p className="font-medium">{form.name}</p>
                    <p className="mt-1 text-xs text-ink-soft">{form.fields.length} field(s) · {form.submissionCount} submission(s)</p>
                  </div>
                  <span className="text-sm text-ink-soft">{isOpen ? "Close" : "Edit"}</span>
                </button>
                {isOpen && (
                  <>
                    <FormEditor form={form} onClose={() => setOpenId(null)} />
                    <div className="mt-3 flex justify-end border-t border-line pt-3">
                      <button
                        type="button"
                        onClick={() => void removeForm(form)}
                        disabled={deletingId === form.id}
                        className="rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        {deletingId === form.id ? "Deleting…" : "Delete form"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
