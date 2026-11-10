/** A saved, reusable form built in Console -> Forms: its name, copy, and
 * field list. Placeable as a page-builder "savedForm" block or opened as a
 * popup from any button's action -- the same form definition drives both,
 * and the same form can be reused in more than one place.
 *
 * No imports on purpose: safe for client components and plain node tests.
 * The DB read/write lives in src/lib/forms.ts. */

export type FormFieldType = "text" | "email" | "phone" | "textarea" | "select" | "checkbox" | "number" | "date";

export const FORM_FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "textarea", label: "Long text" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
];

export type FormField = {
  /** Stable key for this field's value in a submission, independent of
   * label text so renaming a label never orphans past submissions'
   * field_values keys. Auto-generated from the label when a field is added. */
  key: string;
  label: string;
  type: FormFieldType;
  /** Comma-separated choices, only meaningful when type === "select". */
  options: string;
  required: boolean;
};

export type FormDefinition = {
  id: number;
  name: string;
  heading: string;
  introText: string;
  fields: FormField[];
  submitLabel: string;
  successHeading: string;
  successText: string;
  notifyEmail: string;
};

export const MAX_FORM_FIELDS = 20;

function slugifyKey(label: string, index: number): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return base || `field_${index + 1}`;
}

/** Coerces anything (a console save, a stored JSON blob) into a clean field
 * list. Unknown types fall back to "text"; keys are de-duplicated so two
 * fields with the same label don't collide in field_values. */
export function normalizeFormFields(input: unknown): FormField[] {
  const raw = Array.isArray(input) ? input : [];
  const seenKeys = new Set<string>();
  return raw.slice(0, MAX_FORM_FIELDS).map((item, index) => {
    const obj = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const label = typeof obj.label === "string" ? obj.label.trim().slice(0, 100) : "";
    const type = FORM_FIELD_TYPES.some((t) => t.value === obj.type) ? (obj.type as FormFieldType) : "text";
    let key = typeof obj.key === "string" && obj.key.trim() ? obj.key.trim().slice(0, 60) : slugifyKey(label, index);
    while (seenKeys.has(key)) key = `${key}_${index}`;
    seenKeys.add(key);
    return {
      key,
      label,
      type,
      options: typeof obj.options === "string" ? obj.options.slice(0, 500) : "",
      required: obj.required === true,
    };
  });
}

export function normalizeFormDefinition(input: unknown): Omit<FormDefinition, "id"> {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const str = (value: unknown, limit = 200) => (typeof value === "string" ? value.trim().slice(0, limit) : "");
  return {
    name: str(raw.name, 100),
    heading: str(raw.heading, 200),
    introText: str(raw.introText, 600),
    fields: normalizeFormFields(raw.fields),
    submitLabel: str(raw.submitLabel, 60) || "Submit",
    successHeading: str(raw.successHeading, 200),
    successText: str(raw.successText, 600),
    notifyEmail: str(raw.notifyEmail, 200),
  };
}

/** Returns a human-readable error, or null if the form can be saved. */
export function validateFormDefinition(form: Omit<FormDefinition, "id">): string | null {
  if (!form.name) return "Give this form a name.";
  if (!form.fields.length) return "Add at least one field.";
  if (form.fields.some((f) => !f.label)) return "Every field needs a label.";
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (form.notifyEmail && !EMAIL_RE.test(form.notifyEmail)) return "The notify email doesn't look like an email address.";
  return null;
}
