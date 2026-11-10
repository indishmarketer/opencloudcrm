"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import BrandSelect from "@/components/BrandSelect";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  FORM_FIELD_TYPES,
  EMPTY_FORM_DESIGN,
  MAX_FORM_FIELDS,
  type FormDefinition,
  type FormDesign,
  type FormField,
} from "@/lib/formsShape";

type FormRow = FormDefinition & { submissionCount: number };
type FixedForm = { name: string; note: string; editHref: string | null };

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink";
const labelClass = "text-sm font-medium";

function emptyField(): FormField {
  return { key: "", label: "", type: "text", options: "", required: false, hidden: false, defaultValue: "" };
}

// ── Drag-and-drop field row ──────────────────────────────────────────────────

function SortableField({
  field,
  index,
  onChange,
  onRemove,
}: {
  field: FormField;
  index: number;
  onChange: (patch: Partial<FormField>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.key || `field-${index}`,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border border-line p-3 ${field.hidden ? "bg-paper-soft" : "bg-paper"}`}
    >
      <div className="flex flex-wrap items-end gap-2">
        {/* Drag handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mb-2 cursor-grab touch-none rounded p-1 text-ink-soft hover:text-ink active:cursor-grabbing"
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </button>

        <div className="flex-1 min-w-[120px]">
          <label className={labelClass}>{field.hidden ? "Key (internal)" : "Label"}</label>
          <input
            value={field.hidden ? field.key : field.label}
            onChange={(e) =>
              field.hidden ? onChange({ key: e.target.value }) : onChange({ label: e.target.value })
            }
            className={inputClass}
            placeholder={field.hidden ? "e.g. utm_source" : "e.g. Your email"}
          />
        </div>

        {!field.hidden && (
          <div className="w-36">
            <label className={labelClass}>Type</label>
            <BrandSelect
              value={field.type}
              onChange={(v) => onChange({ type: v as FormField["type"] })}
              options={FORM_FIELD_TYPES}
              compact
            />
          </div>
        )}

        {field.hidden && (
          <div className="flex-1 min-w-[100px]">
            <label className={labelClass}>Default value</label>
            <input
              value={field.defaultValue}
              onChange={(e) => onChange({ defaultValue: e.target.value })}
              className={inputClass}
              placeholder="e.g. {{utm_source}}"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pb-1">
          {!field.hidden && (
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => onChange({ required: e.target.checked })}
                className="h-4 w-4"
              />
              Required
            </label>
          )}
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={field.hidden}
              onChange={(e) => onChange({ hidden: e.target.checked })}
              className="h-4 w-4"
            />
            {field.hidden ? (
              <span className="text-ink-soft">Hidden</span>
            ) : (
              "Hidden"
            )}
          </label>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
          >
            Remove
          </button>
        </div>
      </div>

      {!field.hidden && field.type === "select" && (
        <div className="mt-2">
          <label className={labelClass}>Dropdown options (comma separated)</label>
          <input
            value={field.options}
            onChange={(e) => onChange({ options: e.target.value })}
            className={inputClass}
            placeholder="Option A, Option B, Option C"
          />
        </div>
      )}

      {field.hidden && (
        <p className="mt-1.5 text-xs text-ink-soft">
          Not shown to visitors — submitted silently with its default value. Useful for capturing tracking
          context (UTM parameters, source page URL, campaign name).
        </p>
      )}
    </div>
  );
}

// ── Fields editor with drag-and-drop ────────────────────────────────────────

function FieldsEditor({ fields, onChange }: { fields: FormField[]; onChange: (fields: FormField[]) => void }) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f, i) => (f.key || `field-${i}`) === active.id);
    const newIndex = fields.findIndex((f, i) => (f.key || `field-${i}`) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = [...fields];
    next.splice(newIndex, 0, next.splice(oldIndex, 1)[0]);
    onChange(next);
  }

  const ids = fields.map((f, i) => f.key || `field-${i}`);

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {fields.map((field, i) => (
            <SortableField
              key={field.key || i}
              field={field}
              index={i}
              onChange={(patch) => onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))}
              onRemove={() => onChange(fields.filter((_, idx) => idx !== i))}
            />
          ))}
        </SortableContext>
      </DndContext>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange([...fields, emptyField()])}
          disabled={fields.length >= MAX_FORM_FIELDS}
          className="rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-ink disabled:opacity-40"
        >
          + Add field
        </button>
        <button
          type="button"
          onClick={() => onChange([...fields, { ...emptyField(), hidden: true, label: "Hidden field" }])}
          disabled={fields.length >= MAX_FORM_FIELDS}
          className="rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-ink disabled:opacity-40"
          title="Hidden fields aren't shown but are submitted silently"
        >
          + Add hidden field
        </button>
      </div>
    </div>
  );
}

// ── Design tab ───────────────────────────────────────────────────────────────

const DESIGN_FIELDS: { key: keyof FormDesign; label: string; help?: string; isColor?: boolean }[] = [
  { key: "buttonColor", label: "Button background color", isColor: true },
  { key: "buttonTextColor", label: "Button text color", isColor: true },
  { key: "borderColor", label: "Input border color", isColor: true },
  { key: "backgroundColor", label: "Form background color", isColor: true, help: "Applied to the form wrapper." },
  { key: "textColor", label: "Label & text color", isColor: true },
  { key: "borderRadius", label: "Corner roundness", help: "CSS value, e.g. 8px or 9999px for pill." },
  { key: "fontFamily", label: "Font family", help: "CSS font-family, e.g. Inter, Georgia, monospace." },
];

function DesignTab({ design, onChange }: { design: FormDesign; onChange: (d: FormDesign) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        These override the site&apos;s own look for this form specifically — a form placed in a dark section of a
        page, or shared as a standalone link, can have its own colors and font.
        Leave a field empty to inherit the site&apos;s style.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {DESIGN_FIELDS.map(({ key, label, help, isColor }) => (
          <div key={key}>
            <label className={labelClass}>{label}</label>
            {help && <p className="mt-0.5 text-xs text-ink-soft">{help}</p>}
            <div className="flex items-center gap-2">
              <input
                type={isColor ? "color" : "text"}
                value={design[key] || (isColor ? "#000000" : "")}
                onChange={(e) => onChange({ ...design, [key]: e.target.value })}
                className={isColor ? "mt-1 h-9 w-14 cursor-pointer rounded border border-line p-1" : inputClass}
              />
              {isColor && (
                <input
                  type="text"
                  value={design[key]}
                  onChange={(e) => onChange({ ...design, [key]: e.target.value })}
                  placeholder="#000000 or inherit"
                  className="mt-1 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange(EMPTY_FORM_DESIGN)}
        className="text-sm text-ink-soft underline"
      >
        Reset to site defaults
      </button>
    </div>
  );
}

// ── Submissions panel ────────────────────────────────────────────────────────

function SubmissionsPanel({ formId }: { formId: number }) {
  const [submissions, setSubmissions] = useState<
    { id: number; field_values: Record<string, string>; created_at: string }[] | null
  >(null);

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
            <p key={key} className="mt-1">
              <span className="text-ink-soft">{key}:</span> {value}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Form editor ──────────────────────────────────────────────────────────────

type EditorTab = "content" | "design";

function FormEditor({ form, onClose }: { form: FormRow; onClose: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<EditorTab>("content");
  const [name, setName] = useState(form.name);
  const [slug, setSlug] = useState(form.slug || "");
  const [heading, setHeading] = useState(form.heading);
  const [introText, setIntroText] = useState(form.introText);
  const [fields, setFields] = useState<FormField[]>(form.fields);
  const [submitLabel, setSubmitLabel] = useState(form.submitLabel);
  const [successHeading, setSuccessHeading] = useState(form.successHeading);
  const [successText, setSuccessText] = useState(form.successText);
  const [notifyEmail, setNotifyEmail] = useState(form.notifyEmail);
  const [verifyEmail, setVerifyEmail] = useState(form.verifyEmail);
  const [design, setDesign] = useState<FormDesign>(form.design || EMPTY_FORM_DESIGN);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showSubmissions, setShowSubmissions] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/f/${slug}` : null;

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/console/forms/${form.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        slug,
        heading,
        introText,
        fields,
        submitLabel,
        successHeading,
        successText,
        notifyEmail,
        verifyEmail,
        design,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { error?: string }).error || "Could not save this form.");
      return;
    }
    router.refresh();
  }

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const tabClass = (t: EditorTab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"
    }`;

  return (
    <div className="mt-4 border-t border-line pt-4">
      {/* Tab bar */}
      <div className="mb-4 flex gap-0 border-b border-line">
        <button type="button" className={tabClass("content")} onClick={() => setTab("content")}>
          Content
        </button>
        <button type="button" className={tabClass("design")} onClick={() => setTab("design")}>
          Design
        </button>
      </div>

      {tab === "content" && (
        <div className="space-y-4">
          {/* Internal name + slug */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Form name (internal, not shown to visitors)</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Shareable link slug (optional)</label>
              <div className="flex items-center gap-2">
                <span className="mt-1 text-sm text-ink-soft">/f/</span>
                <input
                  value={slug}
                  onChange={(e) =>
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, ""))
                  }
                  className="mt-1 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                  placeholder="contact-form"
                />
              </div>
              {shareUrl && (
                <div className="mt-1 flex items-center gap-2">
                  <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="truncate text-xs text-ink-soft underline">
                    {shareUrl}
                  </a>
                  <button type="button" onClick={copyLink} className="shrink-0 text-xs font-medium underline">
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Visible copy */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Heading (shown above the form — optional)</label>
              <input
                value={heading}
                onChange={(e) => setHeading(e.target.value)}
                className={inputClass}
                placeholder="Leave blank for no heading"
              />
            </div>
            <div>
              <label className={labelClass}>Submit button text</label>
              <input value={submitLabel} onChange={(e) => setSubmitLabel(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Intro text (optional)</label>
            <textarea
              value={introText}
              onChange={(e) => setIntroText(e.target.value)}
              rows={2}
              className={inputClass}
              placeholder="Leave blank for none"
            />
          </div>

          {/* Fields */}
          <div>
            <p className={labelClass}>Fields</p>
            {form.isFixed ? (
              <div className="mt-2 rounded-xl border border-line bg-paper-soft p-4">
                <p className="text-xs text-ink-soft">
                  The field structure for this form is fixed by account authentication logic and cannot be added,
                  removed, or renamed. You can customize header copy, button labels, and all design styling in the
                  Design tab.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {fields.map((f) => (
                    <span
                      key={f.key || f.label}
                      className="rounded-lg border border-line bg-paper px-2.5 py-1 text-xs font-medium"
                    >
                      {f.label} {f.required && <span className="text-red-500">*</span>}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <FieldsEditor fields={fields} onChange={setFields} />
              </div>
            )}
          </div>

          {/* Success copy */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Thank-you heading (optional)</label>
              <input
                value={successHeading}
                onChange={(e) => setSuccessHeading(e.target.value)}
                className={inputClass}
                placeholder="e.g. Thanks, got it."
              />
            </div>
            <div>
              <label className={labelClass}>Notify email (besides the console inbox)</label>
              <input
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                className={inputClass}
                placeholder="you@example.com"
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Thank-you text (optional)</label>
            <textarea
              value={successText}
              onChange={(e) => setSuccessText(e.target.value)}
              rows={2}
              className={inputClass}
            />
          </div>

          {/* Email verification toggle */}
          <label className="flex items-start gap-3 rounded-xl border border-line p-3">
            <input
              type="checkbox"
              checked={verifyEmail}
              onChange={(e) => setVerifyEmail(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <div>
              <p className="text-sm font-medium">Require email verification before submitting</p>
              <p className="mt-0.5 text-xs text-ink-soft">
                After the visitor fills the form, we send a 6-digit code to their email field. They
                enter it to confirm they own the inbox — keeps the inbox spam-free. Requires an email
                field to be present.
              </p>
            </div>
          </label>
        </div>
      )}

      {tab === "design" && <DesignTab design={design} onChange={setDesign} />}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink"
        >
          Close
        </button>
        <button
          type="button"
          onClick={() => setShowSubmissions((v) => !v)}
          className="ml-auto text-sm font-medium underline"
        >
          {showSubmissions ? "Hide" : "Show"} submissions ({form.submissionCount})
        </button>
      </div>
      {showSubmissions && <div className="mt-3"><SubmissionsPanel formId={form.id} /></div>}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ConsoleForms({ forms, fixedForms }: { forms: FormRow[]; fixedForms: FixedForm[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function createForm() {
    setCreating(true);
    // Start completely blank -- no default fields, no pre-filled copy.
    const res = await fetch("/api/console/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Untitled form", fields: [] }),
    });
    setCreating(false);
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setOpenId((body as { id?: number }).id ?? null);
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
      setDeleteError((body as { error?: string }).error || "Could not delete this form.");
      return;
    }
    if (openId === form.id) setOpenId(null);
    router.refresh();
  }

  return (
    <div>
      {dialog}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Your forms</h2>
          <button
            type="button"
            onClick={createForm}
            disabled={creating}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {creating ? "Creating..." : "+ Create form"}
          </button>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Forms start blank — add exactly the fields you need. Place a form as a page section (Form block,
          &ldquo;A saved form&rdquo; type), open it as a popup from any Hero or CTA button, or share it
          directly via its own link (/f/&lt;slug&gt;).
        </p>
        {deleteError && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {deleteError}
          </p>
        )}
        {!forms.length && (
          <p className="mt-4 text-sm text-ink-soft">No forms yet. Create your first one above.</p>
        )}
        <div className="mt-4 space-y-3">
          {forms.map((form) => {
            const isOpen = openId === form.id;
            const shareSlug = form.slug;
            return (
              <div key={form.id} className="rounded-2xl border border-line bg-paper p-5">
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : form.id)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{form.name}</p>
                      {form.isFixed && (
                        <span className="rounded-full border border-line bg-paper-soft px-2 py-0.5 text-xs text-ink-soft">
                          Fixed fields
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">
                      {form.fields.filter((f) => !f.hidden).length} field(s)
                      {form.fields.some((f) => f.hidden)
                        ? ` · ${form.fields.filter((f) => f.hidden).length} hidden`
                        : ""}
                      {" · "}
                      {form.submissionCount} submission(s)
                      {shareSlug && (
                        <>
                          {" · "}
                          <a
                            href={`/f/${shareSlug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            /f/{shareSlug}
                          </a>
                        </>
                      )}
                      {form.verifyEmail && " · email verification"}
                    </p>
                  </div>
                  <span className="text-sm text-ink-soft">{isOpen ? "Close" : "Edit"}</span>
                </button>
                {isOpen && (
                  <>
                    <FormEditor form={form} onClose={() => setOpenId(null)} />
                    {!form.isFixed && (
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
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {fixedForms.length > 0 && (
        <div className="mt-10 border-t border-line pt-6">
          <h2 className="font-display text-base font-semibold">Fixed by necessity</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Only these keep fixed fields — they carry auth/verification logic this builder doesn&apos;t replace.
          </p>
          <div className="mt-3 space-y-2">
            {fixedForms.map((f) => (
              <div
                key={f.name}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3"
              >
                <div>
                  <p className="text-sm font-medium">{f.name}</p>
                  <p className="text-xs text-ink-soft">{f.note}</p>
                </div>
                {f.editHref && (
                  <a href={f.editHref} className="text-sm font-medium underline">
                    Edit
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
