import { pool } from "@/lib/db";
import type { FormDefinition, FormField } from "@/lib/formsShape";

type FormRow = {
  id: number;
  name: string;
  heading: string;
  intro_text: string;
  fields: FormField[];
  submit_label: string;
  success_heading: string;
  success_text: string;
  notify_email: string | null;
  created_at: Date;
  updated_at: Date;
};

function toDefinition(row: FormRow): FormDefinition {
  return {
    id: row.id,
    name: row.name,
    heading: row.heading,
    introText: row.intro_text,
    fields: row.fields,
    submitLabel: row.submit_label,
    successHeading: row.success_heading,
    successText: row.success_text,
    notifyEmail: row.notify_email || "",
  };
}

export async function listForms(): Promise<(FormDefinition & { submissionCount: number })[]> {
  const result = await pool.query<FormRow & { submission_count: string }>(
    `SELECT f.*, COUNT(s.id)::text AS submission_count
     FROM forms f LEFT JOIN form_submissions s ON s.form_id = f.id
     GROUP BY f.id ORDER BY f.created_at DESC`
  );
  return result.rows.map((row) => ({ ...toDefinition(row), submissionCount: Number(row.submission_count) }));
}

export async function getFormById(id: number): Promise<FormDefinition | null> {
  const result = await pool.query<FormRow>("SELECT * FROM forms WHERE id = $1", [id]);
  const row = result.rows[0];
  return row ? toDefinition(row) : null;
}

export async function createForm(input: Omit<FormDefinition, "id">): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO forms (name, heading, intro_text, fields, submit_label, success_heading, success_text, notify_email)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8) RETURNING id`,
    [input.name, input.heading, input.introText, JSON.stringify(input.fields), input.submitLabel,
     input.successHeading, input.successText, input.notifyEmail || null],
  );
  return result.rows[0].id;
}

export async function updateForm(id: number, input: Omit<FormDefinition, "id">): Promise<boolean> {
  const result = await pool.query(
    `UPDATE forms SET name = $1, heading = $2, intro_text = $3, fields = $4::jsonb, submit_label = $5,
       success_heading = $6, success_text = $7, notify_email = $8, updated_at = now()
     WHERE id = $9`,
    [input.name, input.heading, input.introText, JSON.stringify(input.fields), input.submitLabel,
     input.successHeading, input.successText, input.notifyEmail || null, id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteForm(id: number): Promise<boolean> {
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

export async function listFormSubmissions(formId: number): Promise<{ id: number; field_values: Record<string, string>; page_url: string; created_at: Date }[]> {
  const result = await pool.query(
    "SELECT id, field_values, page_url, created_at FROM form_submissions WHERE form_id = $1 ORDER BY created_at DESC LIMIT 200",
    [formId],
  );
  return result.rows;
}
