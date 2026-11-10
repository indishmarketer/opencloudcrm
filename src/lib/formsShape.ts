/** A saved, reusable form built in Console → Forms: its name, canvas elements,
 * design, and optional email-verification step. Placeable as a page-builder
 * "savedForm" block or opened as a popup from any button's action -- the same
 * form definition drives both, and the same form can be reused in more than
 * one place. Every form also gets a shareable /f/<slug> standalone URL.
 *
 * No imports on purpose: safe for client components and plain node tests.
 * The DB read/write lives in src/lib/forms.ts. */

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
  // Button properties
  buttonLabel?: string;
  buttonAlign?: "full" | "left" | "center" | "right";
  buttonVariant?: "primary" | "outline";
  // Divider properties
  dividerSpacing?: "sm" | "md" | "lg";
  // Per-element custom styling
  elementStyle?: {
    backgroundColor?: string;
    textColor?: string;
    borderColor?: string;
    borderRadius?: string;
    fontSize?: string;
    textAlign?: "left" | "center" | "right";
    padding?: string;
  };
};

export type FormField = {
  key: string;
  label: string;
  type: FormFieldType;
  options: string;
  required: boolean;
  hidden: boolean;
  defaultValue: string;
};

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

export const MAX_FORM_FIELDS = 30;

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
    "hidden",
  ].includes(type);
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
    const elementStyle = rawStyle ? {
      backgroundColor: str(rawStyle.backgroundColor, 50) || undefined,
      textColor: str(rawStyle.textColor, 50) || undefined,
      borderColor: str(rawStyle.borderColor, 50) || undefined,
      borderRadius: str(rawStyle.borderRadius, 50) || undefined,
      fontSize: str(rawStyle.fontSize, 30) || undefined,
      textAlign: ["left", "center", "right"].includes(String(rawStyle.textAlign)) ? (rawStyle.textAlign as "left" | "center" | "right") : undefined,
      padding: str(rawStyle.padding, 30) || undefined,
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
