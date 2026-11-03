"use client";

import { useState } from "react";
import Link from "next/link";
import type { AuthorApplication } from "@/lib/authorApplications";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending: { text: "Pending", cls: "border border-red-600 text-red-600" },
  approved: { text: "Approved — awaiting draft", cls: "bg-amber-50 text-amber-700" },
  draft_submitted: { text: "Draft submitted", cls: "bg-amber-50 text-amber-700" },
  changes_requested: { text: "Changes requested", cls: "bg-amber-50 text-amber-700" },
  accepted: { text: "Accepted", cls: "bg-paper-soft text-ink" },
  rejected: { text: "Rejected", cls: "bg-paper-soft text-ink-soft" },
};

export default function AuthorApplicationCard({ application }: { application: AuthorApplication }) {
  const [status, setStatus] = useState(application.status);
  const [adminNote, setAdminNote] = useState(application.admin_note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");

  async function act(action: string, extra?: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/console/author-applications/${application.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Something went wrong.");
      setStatus(body.status);
      if (action === "request_changes") {
        setAdminNote(extra?.note ? String(extra.note) : null);
        setAsking(false);
        setNote("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const badge = STATUS_LABEL[status] || STATUS_LABEL.pending;

  return (
    <div className="rounded-2xl border border-line bg-paper p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          {application.applicant_name || "Member"}{" "}
          <a href={`mailto:${application.applicant_email}`} className="text-ink-soft underline hover:text-ink">
            &lt;{application.applicant_email}&gt;
          </a>
        </p>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.text}</span>
          <p className="text-xs text-ink-soft">{new Date(application.created_at).toLocaleString()}</p>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-soft">{application.topics}</p>
      {application.sample_url && (
        <a
          href={application.sample_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm font-medium underline"
        >
          Writing sample
        </a>
      )}

      {application.submission_url && (
        <div className="mt-3 rounded-lg bg-paper-soft p-3 text-sm">
          <p className="font-medium text-ink">
            Draft:{" "}
            <a href={application.submission_url} target="_blank" rel="noopener noreferrer" className="underline">
              {application.submission_url}
            </a>
          </p>
          {application.submission_note && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-ink-soft">{application.submission_note}</p>
          )}
        </div>
      )}

      {adminNote && (status === "changes_requested" || status === "draft_submitted") && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <span className="font-medium">You asked for:</span> {adminNote}
        </p>
      )}

      {application.social_links && (
        <div className="mt-3 rounded-lg bg-paper-soft p-3 text-sm">
          <p className="font-medium text-ink">Social links</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-ink-soft">{application.social_links}</p>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {status === "pending" && (
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => act("approved")}
            disabled={busy}
            className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => act("rejected")}
            disabled={busy}
            className="rounded-full border border-line px-5 py-2 text-sm font-medium transition-colors hover:border-ink disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}

      {status === "approved" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-soft">
            Waiting on them to submit a draft link. Nothing else to do here yet — you can email them directly
            using the address above, or withdraw the approval below.
          </p>
          <button
            onClick={() => act("rejected")}
            disabled={busy}
            className="shrink-0 rounded-full border border-line px-4 py-1.5 text-xs font-medium transition-colors hover:border-ink disabled:opacity-50"
          >
            Withdraw / reject
          </button>
        </div>
      )}

      {(status === "draft_submitted" || status === "changes_requested") && !asking && (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => act("accept_draft")}
            disabled={busy || !application.submission_url}
            className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            Accept draft
          </button>
          <button
            onClick={() => setAsking(true)}
            disabled={busy}
            className="rounded-full border border-line px-5 py-2 text-sm font-medium transition-colors hover:border-ink disabled:opacity-50"
          >
            Request changes
          </button>
          <button
            onClick={() => act("rejected")}
            disabled={busy}
            className="rounded-full px-5 py-2 text-sm font-medium text-red-600 transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}

      {asking && (
        <div className="mt-4 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="What needs to change before this is ready?"
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
          />
          <div className="flex gap-2">
            <button
              onClick={() => act("request_changes", { note })}
              disabled={busy || !note.trim()}
              className="rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              Send
            </button>
            <button
              onClick={() => setAsking(false)}
              disabled={busy}
              className="rounded-full border border-line px-4 py-1.5 text-xs font-medium transition-colors hover:border-ink disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status === "accepted" && (
        <div className="mt-4 rounded-lg border border-line p-3 text-sm text-ink-soft">
          Draft accepted{application.social_links ? ", social links are in" : ", waiting on their social links"}.
          When you&apos;re ready to publish:{" "}
          <Link href="/console/blog/authors" className="font-medium text-ink underline">
            create their author profile
          </Link>
          , then add the post the way you add posts today.
        </div>
      )}
    </div>
  );
}
