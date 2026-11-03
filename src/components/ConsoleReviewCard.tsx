"use client";

import { useState } from "react";
import Stars from "@/components/Stars";
import { useConfirm } from "@/components/ConfirmDialog";

type Submission = {
  id: number;
  name: string;
  role: string;
  website: string;
  rating: number;
  message: string;
  status: string;
  created_at: string;
  admin_note: string | null;
  has_contact_email: boolean;
  screenshots: string[];
  youtube_id: string | null;
};

export default function ConsoleReviewCard({ submission }: { submission: Submission }) {
  const [status, setStatus] = useState(submission.status);
  const [adminNote, setAdminNote] = useState(submission.admin_note);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [deleted, setDeleted] = useState(false);
  const { confirm, dialog } = useConfirm();

  async function patch(body: Record<string, unknown>) {
    setUpdating(true);
    setError("");
    try {
      const res = await fetch(`/api/console/reviews/${submission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(responseBody.error || "Something went wrong.");
      if (responseBody.status) setStatus(responseBody.status);
      if (body.action === "request_info") {
        setAdminNote(String(body.note));
        setAsking(false);
        setQuestion("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setUpdating(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({ message: "Delete this review submission? This can't be undone." });
    if (!ok) return;
    setUpdating(true);
    const res = await fetch(`/api/console/reviews/${submission.id}`, { method: "DELETE" });
    if (res.ok) setDeleted(true);
    setUpdating(false);
  }

  if (deleted) return null;

  return (
    <div className="rounded-2xl border border-line bg-paper p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {submission.name} {submission.role && <span className="text-ink-soft">({submission.role})</span>}
          </p>
          {submission.website && (
            <p className="text-xs text-ink-soft break-all">{submission.website}</p>
          )}
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            status === "approved"
              ? "bg-paper-soft text-ink"
              : status === "rejected"
                ? "bg-red-50 text-red-600"
                : status === "needs_info"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-paper-soft text-ink-soft"
          }`}
        >
          {status === "needs_info" ? "waiting on reviewer" : status}
        </span>
      </div>
      <div className="mt-2">
        <Stars count={submission.rating} />
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-soft">{submission.message}</p>

      {submission.youtube_id && (
        <a
          href={`https://www.youtube.com/watch?v=${submission.youtube_id}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block rounded-full bg-paper-soft px-3 py-1 text-xs font-medium text-ink-soft hover:text-ink"
        >
          ▶ Video review attached
        </a>
      )}

      {submission.screenshots.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {submission.screenshots.map((url, index) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Review screenshot ${index + 1}`} className="h-16 w-16 rounded-lg border border-line object-cover" />
            </a>
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-ink-soft">{new Date(submission.created_at).toLocaleString()}</p>

      {adminNote && (
        <p className="mt-3 rounded-lg bg-paper-soft p-3 text-xs text-ink-soft">
          <span className="font-medium text-ink">Asked reviewer:</span> {adminNote}
        </p>
      )}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {(status === "approved" || status === "rejected") && (
        <div className="mt-4">
          <button
            onClick={handleDelete}
            disabled={updating}
            className="rounded-full border border-line px-4 py-1.5 text-xs font-medium text-red-600 transition-colors hover:border-red-300 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      )}

      {(status === "pending" || status === "needs_info") && (
        <div className="mt-4 space-y-3">
          {asking ? (
            <div className="space-y-2">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={2}
                placeholder="What do you want to ask them before publishing this?"
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs outline-none focus:border-ink"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => patch({ action: "request_info", note: question })}
                  disabled={updating || !question.trim()}
                  className="rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
                >
                  Send question
                </button>
                <button
                  onClick={() => setAsking(false)}
                  disabled={updating}
                  className="rounded-full border border-line px-4 py-1.5 text-xs font-medium transition-colors hover:border-ink disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => patch({ action: "approve" })}
                disabled={updating}
                className="rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => patch({ action: "reject" })}
                disabled={updating}
                className="rounded-full border border-line px-4 py-1.5 text-xs font-medium transition-colors hover:border-ink disabled:opacity-50"
              >
                Reject
              </button>
              {status === "pending" && (
                <button
                  onClick={() => setAsking(true)}
                  disabled={updating || !submission.has_contact_email}
                  title={submission.has_contact_email ? undefined : "No account email on file for this review"}
                  className="rounded-full border border-line px-4 py-1.5 text-xs font-medium transition-colors hover:border-ink disabled:opacity-50"
                >
                  Ask a question
                </button>
              )}
              <button
                onClick={handleDelete}
                disabled={updating}
                className="rounded-full px-4 py-1.5 text-xs font-medium text-red-600 transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
      {dialog}
    </div>
  );
}
