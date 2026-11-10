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
  submission_action?: FormSubmissionAction;
  redirect_url?: string;
  notify_email: string | null;
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
    submissionAction: row.submission_action === "redirect" ? "redirect" : "message",
    redirectUrl: row.redirect_url || "",
    notifyEmail: row.notify_email || "",
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
    `INSERT INTO forms (name, slug, heading, intro_text, fields, elements, submit_label, success_heading, success_text, submission_action, redirect_url, notify_email, verify_email, design, is_fixed)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15) RETURNING id`,
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
    // Fixed forms (Sign up / Log in) preserve their fixed field structure
    fields = existing.fields;
  }

  const result = await pool.query(
    `UPDATE forms SET name = $1, slug = $2, heading = $3, intro_text = $4, fields = $5::jsonb,
       elements = $6::jsonb, submit_label = $7, success_heading = $8, success_text = $9,
       submission_action = $10, redirect_url = $11, notify_email = $12,
       verify_email = $13, design = $14::jsonb, updated_at = now()
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
    ],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteForm(id: number): Promise<boolean> {
  const form = await getFormById(id);
  if (form?.isFixed) {
    throw new Error("Built-in fixed forms cannot be deleted.");
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

export async function listFormSubmissions(
  formId: number,
): Promise<{ id: number; field_values: Record<string, string>; page_url: string; created_at: Date }[]> {
  const result = await pool.query(
    "SELECT id, field_values, page_url, created_at FROM form_submissions WHERE form_id = $1 ORDER BY created_at DESC LIMIT 200",
    [formId],
  );
  return result.rows;
}
