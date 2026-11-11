/** A saved, reusable form built in Console → Forms: its name, canvas elements,
 * design, and optional email-verification step. Placeable as a page-builder
 * "savedForm" block or opened as a popup from any button's action -- the same
 * form definition drives both, and the same form can be reused in more than
 * one place. Every form also gets a shareable /f/<slug> standalone URL.
 *
 * No imports on purpose: safe for client components and plain node tests.
 * The DB read/write lives in src/lib/forms.ts. */

/** Where a field's submitted answer lands on the contact record.
 *  - "none"    -- kept in the submission only, never copied to the contact
 *  - name/email/phone/country -- written to that core contact column
 *  - "detail"  -- stored as a named extra detail on the contact, shown on
 *                 the contact page and individually deletable there
 *  undefined = legacy auto-detection (see resolveContactMapping). */
export type FormContactMapping = "none" | "name" | "email" | "phone" | "country" | "detail";

export const FORM_CONTACT_MAPPINGS: { value: FormContactMapping; label: string }[] = [
  { value: "none", label: "Don't add to contact" },
  { value: "name", label: "Contact name" },
  { value: "email", label: "Contact email" },
  { value: "phone", label: "Contact phone" },
  { value: "country", label: "Contact country" },
  { value: "detail", label: "Extra contact detail" },
];

export type FormFieldType =
  | "text"
  | "email"
  | "phone"
  | "textarea"
  | "select"
  | "radio"
  | "multiselect"
  | "checkbox"
  | "country"
  | "address"
  | "number"
  | "date";

export const FORM_FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "textarea", label: "Long text" },
  { value: "select", label: "Dropdown" },
  { value: "radio", label: "Single select" },
  { value: "multiselect", label: "Multi select" },
  { value: "checkbox", label: "Checkbox" },
  { value: "country", label: "Country" },
  { value: "address", label: "Address" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
];

export type FormElementType =
  | "heading"
  | "text"
  | "text_input"
  | "email"
  | "phone"
  | "textarea"
  | "select"
  | "radio"
  | "multiselect"
  | "checkbox"
  | "country"
  | "address"
  | "number"
  | "date"
  | "hidden"
  | "button"
  | "divider";

export const FORM_ELEMENT_PALETTE: {
  type: FormElementType;
  label: string;
  category: "layout" | "fields" | "action";
  description: string;
}[] = [
  { type: "heading", label: "Heading", category: "layout", description: "Title or section header" },
  { type: "text", label: "Paragraph", category: "layout", description: "Instructions, notes, or disclaimer" },
  { type: "text_input", label: "Text input", category: "fields", description: "Single-line text field" },
  { type: "email", label: "Email", category: "fields", description: "Email address with validation" },
  { type: "phone", label: "Phone", category: "fields", description: "Phone number with country flag & code" },
  { type: "textarea", label: "Long text", category: "fields", description: "Multi-line text area" },
  { type: "select", label: "Dropdown", category: "fields", description: "Select menu with custom choices" },
  { type: "radio", label: "Single select", category: "fields", description: "Radio choices where one can be chosen" },
  { type: "multiselect", label: "Multi select", category: "fields", description: "Checkbox choices for multiple picks" },
  { type: "checkbox", label: "Checkbox", category: "fields", description: "Single checkbox or consent toggle" },
  { type: "country", label: "Country", category: "fields", description: "Searchable country selector with flags" },
  { type: "address", label: "Address", category: "fields", description: "Street or postal address" },
  { type: "number", label: "Number", category: "fields", description: "Numeric input" },
  { type: "date", label: "Date", category: "fields", description: "Date picker" },
  { type: "button", label: "Button", category: "action", description: "Form action button" },
  { type: "divider", label: "Divider", category: "layout", description: "Horizontal separation line" },
];

export type FormCanvasElement = {
  id: string;
  type: FormElementType;
  // Heading properties
  headingText?: string;
  headingLevel?: "h1" | "h2" | "h3" | "h4";
  headingAlign?: "left" | "center" | "right";
  // Text properties
  textContent?: string;
  textMuted?: boolean;
  textAlign?: "left" | "center" | "right";
  // Field properties
  fieldKey?: string;
  fieldLabel?: string;
  fieldPlaceholder?: string;
  fieldRequired?: boolean;
  fieldHidden?: boolean;
  fieldDefaultValue?: string;
  fieldOptions?: string;
  /** Where this answer lands on the contact record. Undefined keeps the
   * legacy type-derived behaviour -- see resolveContactMapping. */
  contactMapping?: FormContactMapping;
  /** Label used for the contact detail when contactMapping is "detail".
   * Falls back to the field label. */
  contactDetailLabel?: string;
  // Button properties
  buttonLabel?: string;
  buttonAlign?: "full" | "left" | "center" | "right";
  buttonVariant?: "primary" | "outline";
  // Divider properties
  dividerSpacing?: "sm" | "md" | "lg";
  /** Per-element custom styling. Every value is a plain CSS length/colour
   * string written straight into an inline style, so the same object drives
   * the console preview and the live form with no translation step. All of
   * these apply to every element type -- the editor shows the same Layout
   * block for a heading, an input, a button or a divider. */
  elementStyle?: FormElementStyle;
};

export type FormElementStyle = {
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
  borderWidth?: string;
  borderRadius?: string;
  fontSize?: string;
  fontWeight?: string;
  textAlign?: "left" | "center" | "right";
  /** Legacy single-value padding, still honoured when paddingX/Y are unset. */
  padding?: string;
  paddingX?: string;
  paddingY?: string;
  marginTop?: string;
  marginBottom?: string;
  /** Element box size. For a button these are its real width/height, which
   * is how a button gets a custom size rather than only an alignment. */
  width?: string;
  height?: string;
};

/** Every elementStyle key, with the kind of control the editor renders for
 * it. Shared by the console inspector and the MCP tool schema so the two can
 * never drift apart. */
export const FORM_ELEMENT_STYLE_KEYS = [
  { key: "width", label: "Width", control: "size" },
  { key: "height", label: "Height", control: "size" },
  { key: "paddingX", label: "Padding left/right", control: "size" },
  { key: "paddingY", label: "Padding top/bottom", control: "size" },
  { key: "marginTop", label: "Space above", control: "size" },
  { key: "marginBottom", label: "Space below", control: "size" },
  { key: "fontSize", label: "Font size", control: "size" },
  { key: "fontWeight", label: "Font weight", control: "select" },
  { key: "borderWidth", label: "Border width", control: "size" },
  { key: "borderRadius", label: "Corner radius", control: "radius" },
  { key: "backgroundColor", label: "Background colour", control: "color" },
  { key: "textColor", label: "Text colour", control: "color" },
  { key: "borderColor", label: "Border colour", control: "color" },
  { key: "textAlign", label: "Text alignment", control: "align" },
] as const;

export type FormField = {
  key: string;
  label: string;
  type: FormFieldType;
  options: string;
  required: boolean;
  hidden: boolean;
  defaultValue: string;
  /** Mirrored from the canvas element so the submit route -- which works off
   * `fields`, not `elements` -- can route answers onto the contact without
   * re-deriving anything. */
  contactMapping?: FormContactMapping;
  contactDetailLabel?: string;
};

/** The effective contact mapping for a field. An explicit choice in the
 * editor always wins; otherwise the field's own type decides, which keeps
 * every form built before this setting existed behaving the same way.
 *
 * The legacy fallback deliberately does NOT treat an arbitrary text field as
 * the contact's name: the old submit route matched `f.type === "text"`, so
 * the first text field on any form -- "Company", "Job title", "Order ref" --
 * was silently written over the contact's real name. Only a field that names
 * itself a name is used now. */
export function resolveContactMapping(field: {
  type: FormFieldType;
  key?: string;
  label?: string;
  contactMapping?: FormContactMapping;
}): FormContactMapping {
  if (field.contactMapping) return field.contactMapping;
  if (field.type === "email") return "email";
  if (field.type === "phone") return "phone";
  if (field.type === "country") return "country";
  if (/name/i.test(field.key || "") || /name/i.test(field.label || "")) return "name";
  if (/phone|mobile/i.test(field.key || "") || /phone|mobile/i.test(field.label || "")) return "phone";
  if (/country/i.test(field.key || "") || /country/i.test(field.label || "")) return "country";
  return "none";
}

export type FormDesign = {
  buttonColor: string;
  buttonTextColor: string;
  borderColor: string;
  backgroundColor: string;
  textColor: string;
  borderRadius: string;
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

export type FormSubmissionAction = "message" | "redirect";

export type FormDefinition = {
  id: number;
  name: string;
  slug: string;
  heading: string;
  introText: string;
  fields: FormField[];
  elements: FormCanvasElement[];
  submitLabel: string;
  successHeading: string;
  successText: string;
  submissionAction: FormSubmissionAction;
  redirectUrl: string;
  notifyEmail: string;
  source: string;
  systemRole: "contact" | "newsletter" | null;
  verifyEmail: boolean;
  design: FormDesign;
  isFixed: boolean;
};

export type SubmittedValues = Record<string, string>;

/** The OTP purpose a form's verification codes and magic links are issued
 * under. Lives here rather than in the submit route because /api/verify-link
 * has to recognise it too, and a Next.js route file may only export route
 * handlers. */
export const formSubmitPurpose = (formId: number) => `form-submit-${formId}`;
export const FORM_SUBMIT_PURPOSE_PREFIX = "form-submit-";

export type FormContactDetail = { key: string; label: string; value: string };

/** What one submission contributes to the contact record, decided by each
 * field's own "add to contact" choice (falling back to its type for forms
 * built before that setting existed). */
export type FormContactData = {
  email: string;
  name: string | null;
  phone: string | null;
  country: string | null;
  details: FormContactDetail[];
};

/** Splits a submission into the parts that belong on the contact. Pure, so
 * it is the one place the routing rules live and the one place they are
 * tested; src/lib/formSubmission.ts re-exports it for the server paths. */
export function extractContactData(fields: FormField[], values: SubmittedValues): FormContactData {
  const data: FormContactData = { email: "", name: null, phone: null, country: null, details: [] };

  for (const field of fields) {
    const value = String(values[field.key] ?? "").trim();
    if (!value) continue;
    switch (resolveContactMapping(field)) {
      case "email":
        if (!data.email) data.email = value;
        break;
      case "name":
        if (!data.name) data.name = value.slice(0, 200);
        break;
      case "phone":
        if (!data.phone) data.phone = value.slice(0, 40);
        break;
      case "country":
        if (!data.country) data.country = value;
        break;
      case "detail":
        data.details.push({
          key: field.key,
          label: (field.contactDetailLabel || field.label || field.key).slice(0, 100),
          value: value.slice(0, 2000),
        });
        break;
      default:
        break;
    }
  }
  return data;
}

export const MAX_FORM_FIELDS = 30;

/** Things an agent building a form through MCP cannot work out from the
 * schemas alone. Served by GET /api/v1/forms/element-types alongside the
 * palette, so both MCP transports say the same thing. */
export const FORM_AUTHORING_NOTES = [
  "elements[] is the source of truth and renders in array order; fields[] is derived from it on save.",
  "Every element accepts elementStyle. Lengths take a CSS unit, and a bare number is read as px.",
  "A button's size comes from elementStyle.width / height; buttonAlign only positions a button that has no explicit width.",
  "contactMapping decides what reaches the contact record. Everything submitted is recorded in the form's responses either way.",
  "verifyEmail adds a 6-digit code plus a magic link before the submission is recorded. It needs a visible email element on the form.",
  "Submissions can start an automation: use the custom_form.submitted workflow trigger, with its formId set to a form's id to scope it to that form alone.",
];

export function isFieldElementType(type: FormElementType): boolean {
  return [
    "text_input",
    "email",
    "phone",
    "textarea",
    "select",
    "radio",
    "multiselect",
    "checkbox",
    "country",
    "address",
    "number",
    "date",
    "hidden",
  ].includes(type);
}

/** A CSS length the browser will actually accept, so a hand-typed or
 * MCP-supplied value can never inject arbitrary CSS through an inline style
 * attribute. Bare numbers are read as pixels, which is what the editor's
 * stepper arrows produce. */
export function cssLength(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value === 0 ? "0" : `${Math.round(value * 100) / 100}px`;
  }
  if (typeof value !== "string") return undefined;
  const raw = value.trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === "auto" || raw === "0") return raw;
  if (/^-?[0-9]+(\.[0-9]+)?$/.test(raw)) return `${raw}px`;
  return /^-?[0-9]+(\.[0-9]+)?(px|rem|em|%|vw|vh|ch)$/.test(raw) ? raw : undefined;
}

const CONTACT_MAPPINGS = new Set<string>(FORM_CONTACT_MAPPINGS.map((m) => m.value));

function contactMappingOf(value: unknown): FormContactMapping | undefined {
  return typeof value === "string" && CONTACT_MAPPINGS.has(value) ? (value as FormContactMapping) : undefined;
}

function slugifyKey(label: string, index: number): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return base || `field_${index + 1}`;
}

export function elementsToFields(elements: FormCanvasElement[]): FormField[] {
  const seenKeys = new Set<string>();
  const fields: FormField[] = [];

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!isFieldElementType(el.type)) continue;

    const isHidden = el.type === "hidden" || el.fieldHidden === true;
    const rawType: FormFieldType =
      el.type === "hidden"
        ? "text"
        : el.type === "text_input"
          ? "text"
          : (el.type as FormFieldType);

    const label = (el.fieldLabel ?? (isHidden ? "Hidden tracker" : "Field")).trim().slice(0, 100);
    let key = (el.fieldKey ?? slugifyKey(label, i)).trim().slice(0, 60);
    if (!key) key = `field_${i + 1}`;
    while (seenKeys.has(key)) key = `${key}_${i}`;
    seenKeys.add(key);

    fields.push({
      key,
      label,
      type: rawType,
      options: typeof el.fieldOptions === "string" ? el.fieldOptions.slice(0, 1000) : "",
      required: isHidden ? false : el.fieldRequired === true,
      hidden: isHidden,
      defaultValue: typeof el.fieldDefaultValue === "string" ? el.fieldDefaultValue.slice(0, 500) : "",
      contactMapping: el.contactMapping,
      contactDetailLabel: el.contactDetailLabel,
    });
  }
  return fields.slice(0, MAX_FORM_FIELDS);
}

export function formDefinitionToElements(form: {
  heading?: string;
  introText?: string;
  fields?: FormField[];
  submitLabel?: string;
  elements?: FormCanvasElement[];
}): FormCanvasElement[] {
  if (Array.isArray(form.elements) && form.elements.length > 0) {
    return form.elements;
  }
  const elements: FormCanvasElement[] = [];
  if (form.heading) {
    elements.push({
      id: "elem_heading",
      type: "heading",
      headingText: form.heading,
      headingLevel: "h2",
      headingAlign: "left",
    });
  }
  if (form.introText) {
    elements.push({
      id: "elem_intro",
      type: "text",
      textContent: form.introText,
      textMuted: true,
      textAlign: "left",
    });
  }
  if (Array.isArray(form.fields)) {
    for (const f of form.fields) {
      const type: FormElementType = f.type === "text"
        ? "text_input"
        : (f.type as FormElementType);
      elements.push({
        id: `elem_${f.key || Math.random().toString(36).slice(2, 9)}`,
        type,
        fieldKey: f.key,
        fieldLabel: f.label,
        fieldPlaceholder: "",
        fieldRequired: f.required,
        fieldHidden: f.hidden,
        fieldDefaultValue: f.defaultValue,
        fieldOptions: f.options,
        contactMapping: f.contactMapping,
        contactDetailLabel: f.contactDetailLabel,
      });
    }
  }
  if (form.submitLabel) {
    elements.push({
      id: "elem_submit",
      type: "button",
      buttonLabel: form.submitLabel,
      buttonAlign: "full",
      buttonVariant: "primary",
    });
  }
  return elements;
}

export function normalizeFormElements(input: unknown): FormCanvasElement[] {
  if (!Array.isArray(input)) return [];
  const validTypes: FormElementType[] = [
    ...FORM_ELEMENT_PALETTE.map((p) => p.type),
    "hidden",
  ];

  return input.slice(0, 50).map((raw, index) => {
    const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const id = typeof obj.id === "string" && obj.id ? obj.id : `elem_${index}_${Math.random().toString(36).slice(2, 7)}`;
    const type: FormElementType = validTypes.includes(obj.type as FormElementType)
      ? (obj.type as FormElementType)
      : "text_input";

    const str = (v: unknown, limit = 200) => (typeof v === "string" ? v.trim().slice(0, limit) : "");
    const rawStyle = obj.elementStyle && typeof obj.elementStyle === "object" ? (obj.elementStyle as Record<string, unknown>) : undefined;
    const elementStyle: FormElementStyle | undefined = rawStyle ? {
      backgroundColor: str(rawStyle.backgroundColor, 50) || undefined,
      textColor: str(rawStyle.textColor, 50) || undefined,
      borderColor: str(rawStyle.borderColor, 50) || undefined,
      borderWidth: cssLength(rawStyle.borderWidth),
      borderRadius: str(rawStyle.borderRadius, 50) || undefined,
      fontSize: cssLength(rawStyle.fontSize),
      fontWeight: str(rawStyle.fontWeight, 20) || undefined,
      textAlign: ["left", "center", "right"].includes(String(rawStyle.textAlign)) ? (rawStyle.textAlign as "left" | "center" | "right") : undefined,
      padding: cssLength(rawStyle.padding),
      paddingX: cssLength(rawStyle.paddingX),
      paddingY: cssLength(rawStyle.paddingY),
      marginTop: cssLength(rawStyle.marginTop),
      marginBottom: cssLength(rawStyle.marginBottom),
      width: cssLength(rawStyle.width),
      height: cssLength(rawStyle.height),
    } : undefined;

    return {
      id,
      type,
      headingText: str(obj.headingText, 200),
      headingLevel: ["h1", "h2", "h3", "h4"].includes(String(obj.headingLevel)) ? (obj.headingLevel as "h1" | "h2" | "h3" | "h4") : "h2",
      headingAlign: ["left", "center", "right"].includes(String(obj.headingAlign)) ? (obj.headingAlign as "left" | "center" | "right") : "left",
      textContent: str(obj.textContent, 800),
      textMuted: obj.textMuted === true,
      textAlign: ["left", "center", "right"].includes(String(obj.textAlign)) ? (obj.textAlign as "left" | "center" | "right") : "left",
      fieldKey: str(obj.fieldKey, 60),
      fieldLabel: str(obj.fieldLabel, 100),
      fieldPlaceholder: str(obj.fieldPlaceholder, 100),
      fieldRequired: obj.fieldRequired === true,
      fieldHidden: obj.fieldHidden === true || obj.type === "hidden",
      fieldDefaultValue: str(obj.fieldDefaultValue, 500),
      fieldOptions: str(obj.fieldOptions, 1000),
      contactMapping: contactMappingOf(obj.contactMapping),
      contactDetailLabel: str(obj.contactDetailLabel, 100) || undefined,
      buttonLabel: str(obj.buttonLabel, 60),
      buttonAlign: ["full", "left", "center", "right"].includes(String(obj.buttonAlign)) ? (obj.buttonAlign as "full" | "left" | "center" | "right") : "full",
      buttonVariant: obj.buttonVariant === "outline" ? "outline" : "primary",
      dividerSpacing: ["sm", "md", "lg"].includes(String(obj.dividerSpacing)) ? (obj.dividerSpacing as "sm" | "md" | "lg") : "md",
      elementStyle,
    };
  });
}

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
      contactMapping: contactMappingOf(obj.contactMapping),
      contactDetailLabel: typeof obj.contactDetailLabel === "string" ? obj.contactDetailLabel.slice(0, 100) : undefined,
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
  
  let elements = normalizeFormElements(raw.elements);
  let fields = normalizeFormFields(raw.fields);

  if (elements.length > 0 && fields.length === 0) {
    fields = elementsToFields(elements);
  } else if (fields.length > 0 && elements.length === 0) {
    elements = formDefinitionToElements({
      heading: str(raw.heading, 200),
      introText: str(raw.introText, 600),
      fields,
      submitLabel: str(raw.submitLabel, 60),
    });
  }

  // Derive heading, introText, submitLabel from elements if present
  let heading = str(raw.heading, 200);
  let introText = str(raw.introText, 600);
  let submitLabel = str(raw.submitLabel, 60) || "Submit";

  const firstHeading = elements.find((e) => e.type === "heading");
  if (firstHeading && firstHeading.headingText) {
    heading = firstHeading.headingText;
  }
  const firstText = elements.find((e) => e.type === "text");
  if (firstText && firstText.textContent) {
    introText = firstText.textContent;
  }
  const firstButton = elements.find((e) => e.type === "button");
  if (firstButton && firstButton.buttonLabel) {
    submitLabel = firstButton.buttonLabel;
  }

  return {
    name: str(raw.name, 100),
    slug: str(raw.slug, 80).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, ""),
    heading,
    introText,
    fields,
    elements,
    submitLabel,
    successHeading: str(raw.successHeading, 200),
    successText: str(raw.successText, 600),
    submissionAction: raw.submissionAction === "redirect" ? "redirect" : "message",
    redirectUrl: str(raw.redirectUrl, 300),
    notifyEmail: str(raw.notifyEmail, 200),
    source: str(raw.source, 100),
    systemRole: null,
    verifyEmail: raw.verifyEmail === true,
    design: normalizeDesign(raw.design),
    isFixed: raw.isFixed === true,
  };
}

/** Returns a human-readable error, or null if the form can be saved. */
export function validateFormDefinition(form: Omit<FormDefinition, "id">): string | null {
  if (!form.name) return "Give this form a name.";
  
  // Check field labels for visible fields
  if (form.fields.some((f) => !f.label && !f.hidden)) return "Every visible field needs a label.";
  
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (form.notifyEmail && !EMAIL_RE.test(form.notifyEmail)) return "The notify email doesn't look like an email address.";
  if (form.verifyEmail) {
    const hasEmail = form.fields.some((f) => f.type === "email" && !f.hidden);
    if (!hasEmail) return "Email verification requires an email field.";
  }
  return null;
}
