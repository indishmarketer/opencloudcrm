"use client";

import { useState } from "react";
import Link from "next/link";
import { useConfirm } from "@/components/ConfirmDialog";
import { useRouter } from "next/navigation";

/** The form side of a contact record: the named details their answers were
 * promoted to, and the full responses behind them. Both are removable from
 * here, which is the point -- a contact accumulates whatever forms collected
 * about them, and the owner needs to be able to clear it.
 *
 * "Details from forms" only lists answers whose element is set to "Extra
 * contact detail" in the form editor. Everything else a form asked stays in
 * the response below it. */

export type ContactDetailRow = {
  id: number;
  field_key: string;
  label: string;
  value: string;
  form_name: string | null;
  updated_at: string;
};

export type ContactSubmissionRow = {
  id: number;
  form_id: number;
  form_name: string;
  source: string;
  page_url: string;
  created_at: string;
  answers: { label: string; value: string }[];
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export default function ContactFormData({
  contactId,
  details,
  submissions,
}: {
  contactId: number;
  details: ContactDetailRow[];
  submissions: ContactSubmissionRow[];
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  if (details.length === 0 && submissions.length === 0) return null;

  async function removeDetail(detail: ContactDetailRow) {
    const ok = await confirm({
      message: `Remove "${detail.label}" from this contact? The response it came from is kept.`,
      confirmLabel: "Remove detail",
    });
    if (!ok) return;
    setBusy(`detail-${detail.id}`);
    setError("");
    const res = await fetch(`/api/console/contacts/${contactId}/form-details/${detail.id}`, {
      method: "DELETE",
    }).catch(() => null);
    setBusy("");
    if (!res?.ok) {
      setError(((await res?.json().catch(() => ({}))) as { error?: string })?.error || "Could not remove that detail.");
      return;
    }
    router.refresh();
  }

  async function removeSubmission(row: ContactSubmissionRow) {
    const ok = await confirm({
      message: `Delete this ${row.form_name} response from ${formatTime(row.created_at)}? Details already on the contact are kept.`,
      confirmLabel: "Delete response",
    });
    if (!ok) return;
    setBusy(`submission-${row.id}`);
    setError("");
    const res = await fetch(`/api/v1/forms/${row.form_id}/submissions/${row.id}`, {
      method: "DELETE",
    }).catch(() => null);
    setBusy("");
    if (!res?.ok) {
      setError(((await res?.json().catch(() => ({}))) as { error?: string })?.error || "Could not delete that response.");
      return;
    }
    router.refresh();
  }

  return (
    <>
      {dialog}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {details.length > 0 && (
        <section className="rounded-2xl border border-line bg-paper p-6">
          <h2 className="font-display text-lg font-semibold">Details from forms</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Answers a form was told to add to this contact. The latest answer for each one wins.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {details.map((detail) => (
              <div key={detail.id} className="rounded-xl border border-line p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-xs text-ink-soft">{detail.label}</dt>
                  <button
                    type="button"
                    onClick={() => removeDetail(detail)}
                    disabled={busy === `detail-${detail.id}`}
                    title="Remove from contact"
                    className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-red-600 transition-colors hover:border-red-600 disabled:opacity-50"
                  >
                    {busy === `detail-${detail.id}` ? "…" : "Remove"}
                  </button>
                </div>
                <dd className="mt-1 whitespace-pre-wrap text-sm">{detail.value || "—"}</dd>
                <p className="mt-2 text-[10px] text-ink-soft">
                  {detail.form_name || "Deleted form"} · {formatTime(detail.updated_at)}
                </p>
              </div>
            ))}
          </dl>
        </section>
      )}

      {submissions.length > 0 && (
        <section className="rounded-2xl border border-line bg-paper p-6">
          <h2 className="font-display text-lg font-semibold">Form responses</h2>
          <div className="mt-4 space-y-4">
            {submissions.map((submission) => (
              <div key={submission.id} className="rounded-xl border border-line p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="font-medium">
                    {submission.source || submission.form_name} · {formatTime(submission.created_at)}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/console/forms/${submission.form_id}/submissions`}
                      className="rounded-full border border-line px-3 py-1 text-xs font-medium transition-colors hover:border-ink"
                    >
                      All responses
                    </Link>
                    <button
                      type="button"
                      onClick={() => removeSubmission(submission)}
                      disabled={busy === `submission-${submission.id}`}
                      className="rounded-full border border-line px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:border-red-600 disabled:opacity-50"
                    >
                      {busy === `submission-${submission.id}` ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {submission.answers.map((answer, i) => (
                    <div key={`${submission.id}-${i}`}>
                      <dt className="text-ink-soft">{answer.label}</dt>
                      <dd className="whitespace-pre-wrap">{answer.value || "—"}</dd>
                    </div>
                  ))}
                </dl>
                {submission.page_url && (
                  <p className="mt-3 break-all text-xs text-ink-soft">{submission.page_url}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
