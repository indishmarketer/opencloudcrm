"use client";

import { useState } from "react";
import Link from "next/link";
import type { AuthorApplication } from "@/lib/authorApplications";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending: { text: "Pending review", cls: "border border-red-300 bg-red-50 text-red-700" },
  approved: { text: "Approved, awaiting draft", cls: "bg-amber-50 text-amber-700" },
  draft_submitted: { text: "Draft submitted", cls: "bg-purple-50 text-purple-700" },
  changes_requested: { text: "Changes requested", cls: "bg-amber-50 text-amber-700" },
  accepted: { text: "Accepted", cls: "bg-green-50 text-green-700" },
  rejected: { text: "Rejected", cls: "bg-paper-soft text-ink-soft" },
};

const wrap = "min-w-0 break-words [overflow-wrap:anywhere]";

function fileSize(bytes: number | null): string {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

export default function AuthorApplicationCard({ application }: { application: AuthorApplication }) {
  const [status, setStatus] = useState(application.status);
  const [adminNote, setAdminNote] = useState(application.admin_note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [removed, setRemoved] = useState(false);

  async function act(action: string, extra?: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/console/author-applications/${application.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Something went wrong.");
      setStatus(body.status);
      if (action === "request_changes") {
        setAdminNote(extra?.note ? String(extra.note) : null);
        setAsking(false);
        setNote("");
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function deletePermanently() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/console/author-applications/${application.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "The application could not be deleted.");
      setRemoved(true);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "The application could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  if (removed) return null;
  const badge = STATUS_LABEL[status] || STATUS_LABEL.pending;

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_18px_55px_-48px_rgba(76,29,149,0.55)]">
      <div className="p-5 sm:p-6">
        <header className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
            <h2 className={`${wrap} font-display text-lg font-semibold`}>{application.applicant_name || "Applicant"}</h2>
            <a href={`mailto:${application.applicant_email}`} className={`${wrap} mt-1 block text-sm text-ink-soft underline decoration-line underline-offset-2 hover:text-accent`}>
              {application.applicant_email}
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge.cls}`}>{badge.text}</span>
            <time className="whitespace-nowrap text-xs text-ink-soft" dateTime={application.created_at}>
              {new Date(application.created_at).toLocaleString()}
            </time>
          </div>
        </header>

        <section className="mt-5 rounded-xl border border-line bg-paper-soft/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Pitch</p>
          <p className={`${wrap} mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-soft`}>{application.topics}</p>
        </section>

        {(application.sample_url || application.sample_file_name || application.sample_text) && (
          <section className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Writing sample</p>
            <div className="mt-2 flex min-w-0 flex-wrap gap-2">
              {application.sample_url && (
                <a href={application.sample_url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent">Open sample link</a>
              )}
              {application.sample_file_name && (
                <a href={`/api/author-applications/file?id=${application.id}&kind=sample`} className={`${wrap} rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent`}>
                  Download {application.sample_file_name}{fileSize(application.sample_file_size) ? ` (${fileSize(application.sample_file_size)})` : ""}
                </a>
              )}
            </div>
            {application.sample_text && (
              <details className="mt-3 overflow-hidden rounded-xl border border-line bg-paper-soft p-4 text-sm">
                <summary className="cursor-pointer font-medium text-ink">Read pasted sample</summary>
                <p className={`${wrap} mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap leading-6 text-ink-soft`}>{application.sample_text}</p>
              </details>
            )}
          </section>
        )}

        {(application.submission_url || application.submission_file_name) && (
          <section className="mt-4 rounded-xl border border-accent/20 bg-accent-soft/45 p-4 text-sm">
            <p className="font-medium text-ink">Submitted draft</p>
            <div className="mt-2 flex min-w-0 flex-wrap gap-3">
              {application.submission_url && <a href={application.submission_url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline">Open draft link</a>}
              {application.submission_file_name && <a href={`/api/author-applications/file?id=${application.id}&kind=submission`} className={`${wrap} font-medium text-accent underline`}>Download {application.submission_file_name}</a>}
            </div>
            {application.submission_note && <p className={`${wrap} mt-2 whitespace-pre-wrap text-xs leading-5 text-ink-soft`}>{application.submission_note}</p>}
          </section>
        )}

        {adminNote && (status === "changes_requested" || status === "draft_submitted") && (
          <p className={`${wrap} mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900`}>
            <span className="font-semibold">Requested changes:</span> {adminNote}
          </p>
        )}

        {application.social_links && (
          <div className="mt-4 rounded-xl bg-paper-soft p-4 text-sm">
            <p className="font-medium text-ink">Author links</p>
            <p className={`${wrap} mt-1 whitespace-pre-wrap text-xs leading-5 text-ink-soft`}>{application.social_links}</p>
          </div>
        )}

        {error && <p className={`${wrap} mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700`} role="alert">{error}</p>}

        {asking && (
          <div className="mt-5 rounded-xl border border-line bg-paper-soft p-4">
            <label className="text-sm font-medium" htmlFor={`changes-${application.id}`}>What needs to change?</label>
            <textarea id={`changes-${application.id}`} value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Give the writer specific, useful revision notes." className="mt-2 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" />
            <div className="mt-3 flex gap-2">
              <button onClick={() => act("request_changes", { note })} disabled={busy || !note.trim()} className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-on disabled:opacity-50">Send revision request</button>
              <button onClick={() => setAsking(false)} disabled={busy} className="rounded-full border border-line px-4 py-2 text-xs font-medium disabled:opacity-50">Cancel</button>
            </div>
          </div>
        )}

        {status === "accepted" && (
          <div className="mt-5 rounded-xl border border-line p-4 text-sm leading-6 text-ink-soft">
            The draft is accepted{application.social_links ? " and the author links are ready" : ", and author links are still pending"}. When you are ready, <Link href="/console/blog/authors" className="font-medium text-ink underline">create or update the author profile</Link> and publish the post through the normal blog workflow.
          </div>
        )}
      </div>

      <footer className="border-t border-line bg-paper-soft/45 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2.5">
          {status === "pending" && <><button onClick={() => act("approved")} disabled={busy} className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-on disabled:opacity-50">Approve</button><button onClick={() => act("rejected")} disabled={busy} className="rounded-full border border-line bg-paper px-5 py-2 text-sm font-medium hover:border-red-300 hover:text-red-700 disabled:opacity-50">Reject</button></>}
          {status === "approved" && <><span className="mr-auto text-sm text-ink-soft">Waiting for the writer to send a full draft.</span><button onClick={() => act("rejected")} disabled={busy} className="rounded-full border border-line bg-paper px-4 py-2 text-xs font-medium hover:border-red-300 hover:text-red-700 disabled:opacity-50">Withdraw approval</button></>}
          {(status === "draft_submitted" || status === "changes_requested") && !asking && <><button onClick={() => act("accept_draft")} disabled={busy || (!application.submission_url && !application.submission_file_name)} className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-on disabled:opacity-50">Accept draft</button><button onClick={() => setAsking(true)} disabled={busy} className="rounded-full border border-line bg-paper px-5 py-2 text-sm font-medium disabled:opacity-50">Request changes</button><button onClick={() => act("rejected")} disabled={busy} className="rounded-full px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50">Reject</button></>}
          {status === "rejected" && !confirmingDelete && <button onClick={() => setConfirmingDelete(true)} disabled={busy} className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">Delete permanently</button>}
        </div>

        {status === "rejected" && confirmingDelete && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-900">Permanently delete this application?</p>
            <p className="mt-1 text-xs leading-5 text-red-800">This removes the application record, its console alerts, and any uploaded sample or draft documents. It cannot be undone.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={deletePermanently} disabled={busy} className="rounded-full bg-red-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Deleting..." : "Yes, delete permanently"}</button>
              <button onClick={() => setConfirmingDelete(false)} disabled={busy} className="rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-medium text-red-800 disabled:opacity-50">Cancel</button>
            </div>
          </div>
        )}
      </footer>
    </article>
  );
}
