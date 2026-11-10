/** A saved, reusable form built in Console → Forms: its name, copy, fields,
 * design, and optional email-verification step.  Placeable as a page-builder
 * "savedForm" block or opened as a popup from any button's action -- the same
 * form definition drives both, and the same form can be reused in more than
 * one place.  Every form also gets a shareable /f/<slug> standalone URL.
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
   * field_values keys.  Auto-generated from the label when a field is added. */
  key: string;
  label: string;
  type: FormFieldType;
  /** Comma-separated choices, only meaningful when type === "select". */
  options: string;
  required: boolean;
  /** When true the field is not shown to the visitor but its defaultValue is
   * still included in the submission payload -- for silently capturing
   * tracking context like UTM parameters from the page the form sits on. */
  hidden: boolean;
  /** Pre-set value submitted for a hidden field (e.g. a UTM source).  Also
   * used as the initial value of a visible field when the form pre-fills. */
  defaultValue: string;
};

/** Per-form design tokens.  Every field defaults to "" which means "inherit
 * the site's own look."  Non-empty values are applied as inline styles by
 * SavedForm so they can never be overridden by the site theme or the page
 * the form sits in. */
export type FormDesign = {
  /** Hex/CSS color for the submit button background. */
  buttonColor: string;
  /** Hex/CSS color for the submit button label. */
  buttonTextColor: string;
  /** Hex/CSS color for input borders. */
  borderColor: string;
  /** Hex/CSS color for the form background (wrapper). */
  backgroundColor: string;
  /** Hex/CSS color for label and body text. */
  textColor: string;
  /** CSS border-radius value for inputs and the button (e.g. "8px" or "9999px"). */
  borderRadius: string;
  /** CSS font-family override for the whole form. */
  fontFamily: string;
};

export const EMPTY_FORM_DESIGN: FormDesign = {
  buttonColor: "",
  buttonTextColor: "",
  borderColor: "",
  backgroundColor: "",
  textColor: "",
  borderRadius: "",
  fontFamily: "",
};

export type FormDefinition = {
  id: number;
  name: string;
  /** Optional URL-safe slug for the /f/<slug> standalone page. */
  slug: string;
  heading: string;
  introText: string;
  fields: FormField[];
  submitLabel: string;
  successHeading: string;
  successText: string;
  notifyEmail: string;
  /** When true, the form collects data then sends an OTP to the visitor's
   * email field; the submission is only recorded after they confirm it. */
  verifyEmail: boolean;
  design: FormDesign;
  /** When true, this form's field structure is fixed by core auth/security
   * logic (Sign up / Log in). The form cannot be deleted and its field list
   * cannot be edited, but its header text, submit label, and design tokens
   * are fully editable. */
  isFixed: boolean;
};

export const MAX_FORM_FIELDS = 20;

function slugifyKey(label: string, index: number): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return base || `field_${index + 1}`;
}

/** Coerces anything (a console save, a stored JSON blob) into a clean field
 * list.  Unknown types fall back to "text"; keys are de-duplicated so two
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
      hidden: obj.hidden === true,
      defaultValue: typeof obj.defaultValue === "string" ? obj.defaultValue.slice(0, 500) : "",
    };
  });
}

function normalizeDesign(input: unknown): FormDesign {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 100) : "");
  return {
    buttonColor: str(raw.buttonColor),
    buttonTextColor: str(raw.buttonTextColor),
    borderColor: str(raw.borderColor),
    backgroundColor: str(raw.backgroundColor),
    textColor: str(raw.textColor),
    borderRadius: str(raw.borderRadius),
    fontFamily: str(raw.fontFamily),
  };
}

export function normalizeFormDefinition(input: unknown): Omit<FormDefinition, "id"> {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const str = (value: unknown, limit = 200) => (typeof value === "string" ? value.trim().slice(0, limit) : "");
  return {
    name: str(raw.name, 100),
    slug: str(raw.slug, 80).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, ""),
    heading: str(raw.heading, 200),
    introText: str(raw.introText, 600),
    fields: normalizeFormFields(raw.fields),
    submitLabel: str(raw.submitLabel, 60) || "Submit",
    successHeading: str(raw.successHeading, 200),
    successText: str(raw.successText, 600),
    notifyEmail: str(raw.notifyEmail, 200),
    verifyEmail: raw.verifyEmail === true,
    design: normalizeDesign(raw.design),
    isFixed: raw.isFixed === true,
  };
}

/** Returns a human-readable error, or null if the form can be saved. */
export function validateFormDefinition(form: Omit<FormDefinition, "id">): string | null {
  if (!form.name) return "Give this form a name.";
  // A form with no fields is valid -- it starts completely blank.
  if (form.fields.some((f) => !f.label && !f.hidden)) return "Every visible field needs a label.";
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (form.notifyEmail && !EMAIL_RE.test(form.notifyEmail)) return "The notify email doesn't look like an email address.";
  if (form.verifyEmail) {
    const hasEmail = form.fields.some((f) => f.type === "email" && !f.hidden);
    if (!hasEmail) return "Email verification requires an email field.";
  }
  return null;
}
