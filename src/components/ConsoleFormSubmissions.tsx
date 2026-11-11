"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";
import type { FormField } from "@/lib/formsShape";
import { resolveContactMapping } from "@/lib/formsShape";

/** Everything a form has collected. The submissions API and the
 * form_submissions table have existed since the form builder shipped, but
 * nothing in the console ever read them -- the only way to see a response was
 * the one-line inbox alert, or the subset that happened to reach a contact.
 * This is the missing screen. */

export type SubmissionRow = {
  id: number;
  field_values: Record<string, string>;
  page_url: string;
  created_at: string;
  contact_id: number | null;
  contact_email: string | null;
  contact_name: string | null;
};

const button =
  "inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50";
const pillDanger =
  "inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:border-red-600 disabled:cursor-not-allowed disabled:opacity-50";

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export default function ConsoleFormSubmissions({
  formId,
  formName,
  fields,
  submissions,
  totalCount,
}: {
  formId: number;
  formName: string;
  fields: FormField[];
  submissions: SubmissionRow[];
  totalCount: number;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  // Columns come from the form's current field list, plus any key that only
  // exists in older responses -- a field renamed or removed since should not
  // make the answers it already collected invisible.
  const columns = useMemo(() => {
    const seen = new Map<string, string>();
    for (const field of fields) seen.set(field.key, field.label || field.key);
    for (const row of submissions) {
      for (const key of Object.keys(row.field_values)) {
        if (!seen.has(key)) seen.set(key, `${key} (removed field)`);
      }
    }
    return [...seen.entries()].map(([key, label]) => ({ key, label }));
  }, [fields, submissions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return submissions;
    return submissions.filter((row) =>
      [row.contact_email, row.contact_name, row.page_url, ...Object.values(row.field_values)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [submissions, query]);

  async function removeSubmission(row: SubmissionRow) {
    const ok = await confirm({
      message: `Delete this response from ${formatTime(row.created_at)}? Details already copied onto the contact are kept — remove those from the contact's own page.`,
      confirmLabel: "Delete response",
    });
    if (!ok) return;

    setBusyId(row.id);
    setError("");
    const res = await fetch(`/api/v1/forms/${formId}/submissions/${row.id}`, { method: "DELETE" }).catch(() => null);
    setBusyId(null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => ({}))) ?? {};
      setError(body.error || "Could not delete this response.");
      return;
    }
    router.refresh();
  }

  function downloadCsv() {
    const header = ["Submitted at", "Contact email", "Contact name", "Page", ...columns.map((c) => c.label)];
    const lines = [header.map(csvCell).join(",")];
    for (const row of filtered) {
      lines.push(
        [
          new Date(row.created_at).toISOString(),
          row.contact_email || "",
          row.contact_name || "",
          row.page_url || "",
          ...columns.map((c) => row.field_values[c.key] ?? ""),
        ]
          .map(csvCell)
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${formName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "form"}-responses.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const contactFields = fields.filter((f) => resolveContactMapping(f) !== "none");

  return (
    <div className="space-y-5">
      {dialog}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink-soft">
            {totalCount} total response{totalCount === 1 ? "" : "s"}
            {submissions.length < totalCount && ` · showing the most recent ${submissions.length}`}
          </p>
          {contactFields.length > 0 && (
            <p className="mt-1 text-xs text-ink-soft">
              {contactFields.map((f) => f.label || f.key).join(", ")} also{" "}
              {contactFields.length === 1 ? "lands" : "land"} on the contact record.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search responses…"
            className="rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none transition focus:border-ink"
          />
          <button type="button" onClick={downloadCsv} disabled={filtered.length === 0} className={button}>
            Download CSV
          </button>
          <Link href={`/console/forms/${formId}`} className={button}>
            Edit form
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper p-8 text-center text-sm text-ink-soft">
          {submissions.length === 0
            ? "No responses yet. They appear here the moment someone submits this form."
            : "No responses match that search."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-paper">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-semibold">Submitted</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                {columns.slice(0, 3).map((col) => (
                  <th key={col.key} className="hidden px-4 py-3 font-semibold lg:table-cell">
                    {col.label}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((row) => (
                <Fragment key={row.id}>
                  <tr>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-soft">{formatTime(row.created_at)}</td>
                    <td className="px-4 py-3">
                      {row.contact_id ? (
                        <Link href={`/console/contacts/${row.contact_id}`} className="underline">
                          {row.contact_name || row.contact_email}
                        </Link>
                      ) : (
                        <span className="text-ink-soft">Anonymous</span>
                      )}
                    </td>
                    {columns.slice(0, 3).map((col) => (
                      <td key={col.key} className="hidden max-w-[220px] truncate px-4 py-3 lg:table-cell">
                        {row.field_values[col.key] || <span className="text-ink-soft">—</span>}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                          className="rounded-full border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-ink"
                        >
                          {expanded === row.id ? "Hide" : "View all"}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSubmission(row)}
                          disabled={busyId === row.id}
                          className={pillDanger}
                        >
                          {busyId === row.id ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === row.id && (
                    <tr className="bg-paper-soft/50">
                      <td colSpan={columns.slice(0, 3).length + 3} className="px-4 py-4">
                        <dl className="grid gap-3 sm:grid-cols-2">
                          {columns.map((col) => (
                            <div key={col.key}>
                              <dt className="text-xs text-ink-soft">{col.label}</dt>
                              <dd className="whitespace-pre-wrap text-sm">
                                {row.field_values[col.key] || "—"}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        {row.page_url && (
                          <p className="mt-3 break-all text-xs text-ink-soft">Submitted from {row.page_url}</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
