import { pool } from "@/lib/db";
import {
  elementsToFields,
  formDefinitionToElements,
  normalizeFormElements,
  type FormCanvasElement,
  type FormDefinition,
  type FormDesign,
  type FormField,
  type FormSubmissionAction,
} from "@/lib/formsShape";

type FormRow = {
  id: number;
  name: string;
  slug: string | null;
  heading: string;
  intro_text: string;
  fields: FormField[];
  elements?: FormCanvasElement[];
  submit_label: string;
  success_heading: string;
  success_text: string;
  success_image?: string;
  submission_action?: FormSubmissionAction;
  redirect_url?: string;
  notify_email: string | null;
  source: string;
  system_role: "contact" | "newsletter" | null;
  verify_email: boolean;
  design: FormDesign;
  is_fixed: boolean;
  created_at: Date;
  updated_at: Date;
};

function toDefinition(row: FormRow): FormDefinition {
  const elements =
    Array.isArray(row.elements) && row.elements.length > 0
      ? normalizeFormElements(row.elements)
      : formDefinitionToElements({
          heading: row.heading,
          introText: row.intro_text,
          fields: row.fields || [],
          submitLabel: row.submit_label,
        });

  return {
    id: row.id,
    name: row.name,
    slug: row.slug || "",
    heading: row.heading,
    introText: row.intro_text,
    fields: row.fields || [],
    elements,
    submitLabel: row.submit_label,
    successHeading: row.success_heading,
    successText: row.success_text,
    successImage: row.success_image || "",
    submissionAction: row.submission_action === "redirect" ? "redirect" : "message",
    redirectUrl: row.redirect_url || "",
    notifyEmail: row.notify_email || "",
    source: row.source || "",
    systemRole: row.system_role || null,
    verifyEmail: row.verify_email,
    design: row.design || {},
    isFixed: row.is_fixed === true,
  };
}

export async function listForms(): Promise<(FormDefinition & { submissionCount: number })[]> {
  const result = await pool.query<FormRow & { submission_count: string }>(
    `SELECT f.*, COUNT(s.id)::text AS submission_count
     FROM forms f LEFT JOIN form_submissions s ON s.form_id = f.id
     GROUP BY f.id ORDER BY f.created_at DESC`,
  );
  return result.rows.map((row) => ({ ...toDefinition(row), submissionCount: Number(row.submission_count) }));
}

export async function getFormById(id: number): Promise<FormDefinition | null> {
  const result = await pool.query<FormRow>("SELECT * FROM forms WHERE id = $1", [id]);
  const row = result.rows[0];
  return row ? toDefinition(row) : null;
}

export async function getFormBySlug(slug: string): Promise<FormDefinition | null> {
  const result = await pool.query<FormRow>("SELECT * FROM forms WHERE slug = $1", [slug]);
  const row = result.rows[0];
  return row ? toDefinition(row) : null;
}

export async function createForm(input: Omit<FormDefinition, "id">): Promise<number> {
  const elements =
    input.elements && input.elements.length > 0 ? input.elements : formDefinitionToElements(input);
  const fields = elementsToFields(elements);

  const result = await pool.query<{ id: number }>(
    `INSERT INTO forms (name, slug, heading, intro_text, fields, elements, submit_label, success_heading, success_text, submission_action, redirect_url, notify_email, verify_email, design, is_fixed, source, success_image)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17) RETURNING id`,
    [
      input.name,
      input.slug || null,
      input.heading,
      input.introText,
      JSON.stringify(fields.length > 0 ? fields : input.fields),
      JSON.stringify(elements),
      input.submitLabel,
      input.successHeading,
      input.successText,
      input.submissionAction || "message",
      input.redirectUrl || "",
      input.notifyEmail || null,
      input.verifyEmail,
      JSON.stringify(input.design),
      input.isFixed === true,
      input.source,
      input.successImage || "",
    ],
  );
  return result.rows[0].id;
}

export async function updateForm(id: number, input: Omit<FormDefinition, "id">): Promise<boolean> {
  const existing = await getFormById(id);
  if (!existing) return false;

  const elements =
    input.elements && input.elements.length > 0 ? input.elements : formDefinitionToElements(input);

  let fields = elementsToFields(elements);
  if (existing.isFixed) {
    // The Sign up / Log in form preserves its fixed field structure; only
    // its copy and design are editable.
    fields = existing.fields;
  }

  const result = await pool.query(
    `UPDATE forms SET name = $1, slug = $2, heading = $3, intro_text = $4, fields = $5::jsonb,
       elements = $6::jsonb, submit_label = $7, success_heading = $8, success_text = $9,
       submission_action = $10, redirect_url = $11, notify_email = $12,
       verify_email = $13, design = $14::jsonb, source = $16, success_image = $17,
       updated_at = now()
     WHERE id = $15`,
    [
      input.name,
      input.slug || null,
      input.heading,
      input.introText,
      JSON.stringify(fields),
      JSON.stringify(elements),
      input.submitLabel,
      input.successHeading,
      input.successText,
      input.submissionAction || "message",
      input.redirectUrl || "",
      input.notifyEmail || null,
      input.verifyEmail,
      JSON.stringify(input.design),
      id,
      input.source,
      input.successImage || "",
    ],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteForm(id: number): Promise<boolean> {
  const form = await getFormById(id);
  // Only the Sign up / Log in form is undeletable -- core auth plumbing
  // depends on its field list existing. systemRole ('contact',
  // 'newsletter') is a label for the extra behaviour a form carries, not a
  // lock: those forms are ordinary forms the owner can delete, and the
  // behaviour goes away with them.
  if (form?.isFixed) {
    throw new Error("The Sign up / Log in form cannot be deleted -- account access depends on it.");
  }
  const result = await pool.query("DELETE FROM forms WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function recordFormSubmission(input: {
  formId: number;
  fieldValues: Record<string, string>;
  pageUrl: string;
  contactId: number | null;
}): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO form_submissions (form_id, field_values, page_url, contact_id)
     VALUES ($1, $2::jsonb, $3, $4) RETURNING id`,
    [input.formId, JSON.stringify(input.fieldValues), input.pageUrl, input.contactId],
  );
  return result.rows[0].id;
}

export type FormSubmissionRow = {
  id: number;
  field_values: Record<string, string>;
  page_url: string;
  created_at: Date;
  contact_id: number | null;
  contact_email: string | null;
  contact_name: string | null;
};

export async function listFormSubmissions(formId: number, limit = 200): Promise<FormSubmissionRow[]> {
  const result = await pool.query<FormSubmissionRow>(
    `SELECT s.id, s.field_values, s.page_url, s.created_at, s.contact_id,
            c.email AS contact_email, c.name AS contact_name
     FROM form_submissions s LEFT JOIN contacts c ON c.id = s.contact_id
     WHERE s.form_id = $1 ORDER BY s.created_at DESC LIMIT $2`,
    [formId, Math.min(Math.max(limit, 1), 1000)],
  );
  return result.rows;
}

export async function countFormSubmissions(formId: number): Promise<number> {
  const result = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM form_submissions WHERE form_id = $1",
    [formId],
  );
  return Number(result.rows[0]?.count || 0);
}

/** Deletes one recorded response. Any contact detail that came from it keeps
 * its value (the FK is ON DELETE SET NULL) -- removing a response should not
 * silently strip data the owner deliberately promoted onto a contact. */
export async function deleteFormSubmission(formId: number, submissionId: number): Promise<boolean> {
  const result = await pool.query("DELETE FROM form_submissions WHERE id = $1 AND form_id = $2", [
    submissionId,
    formId,
  ]);
  return (result.rowCount ?? 0) > 0;
}
