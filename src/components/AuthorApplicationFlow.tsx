"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/gtag";
import AuthorApplicationForm from "@/components/AuthorApplicationForm";
import type { AuthorApplicationStatus } from "@/lib/authorApplications";

type Application = {
  status: AuthorApplicationStatus;
  submission_url: string | null;
  submission_note: string | null;
  admin_note: string | null;
  social_links: string | null;
};

function DraftSubmissionForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [submissionUrl, setSubmissionUrl] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    try {
      const res = await fetch("/api/author-applications/submission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionUrl, note: note || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Something went wrong.");
      onSubmitted();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <div>
        <label className="text-sm font-medium">Draft link</label>
        <input
          type="url"
          required
          value={submissionUrl}
          onChange={(e) => setSubmissionUrl(e.target.value)}
          placeholder="Google Docs, Notion, or anywhere with a shareable link"
          className="mt-1.5 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
        />
      </div>
      <div>
        <label className="text-sm font-medium">Anything else? (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Notes for us, context, whatever's useful…"
          className="mt-1.5 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={status === "submitting"}
        className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {status === "submitting" ? "Submitting…" : "Submit draft"}
      </button>
    </form>
  );
}

function SocialLinksForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [socialLinks, setSocialLinks] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    try {
      const res = await fetch("/api/author-applications/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ socialLinks }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Something went wrong.");
      onSubmitted();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <div>
        <label className="text-sm font-medium">Your social links</label>
        <textarea
          required
          value={socialLinks}
          onChange={(e) => setSocialLinks(e.target.value)}
          rows={3}
          placeholder="X, LinkedIn, Instagram, website — whatever you want credited under your byline"
          className="mt-1.5 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={status === "submitting"}
        className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {status === "submitting" ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}

export default function AuthorApplicationFlow({ application }: { application: Application | null }) {
  const [current, setCurrent] = useState(application);

  if (!current) return <AuthorApplicationForm />;

  if (current.status === "pending") {
    return (
      <div className="rounded-2xl border border-line bg-paper p-6">
        <p className="font-medium">Your application is under review.</p>
        <p className="mt-1 text-sm text-ink-soft">We&apos;ll email you as soon as we&apos;ve read it.</p>
      </div>
    );
  }

  if (current.status === "approved" || current.status === "changes_requested") {
    return (
      <div className="rounded-2xl border border-line bg-paper p-6">
        <p className="font-medium">You&apos;re approved to write for the blog.</p>
        {current.status === "changes_requested" && current.admin_note && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <span className="font-medium">We asked for:</span> {current.admin_note}
          </p>
        )}
        <p className="mt-2 text-sm text-ink-soft">
          Write your piece anywhere with a shareable link (Google Docs, Notion, etc), then drop the link below.
        </p>
        <DraftSubmissionForm
          onSubmitted={() => {
            trackEvent("generate_lead", { form: "author_draft_submission" });
            setCurrent({ ...current, status: "draft_submitted" });
          }}
        />
      </div>
    );
  }

  if (current.status === "draft_submitted") {
    return (
      <div className="rounded-2xl border border-line bg-paper p-6">
        <p className="font-medium">Your draft is submitted.</p>
        <p className="mt-1 text-sm text-ink-soft">We&apos;re reading it and will email you with next steps.</p>
        {current.submission_url && (
          <a href={current.submission_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm underline">
            View your submitted draft
          </a>
        )}
      </div>
    );
  }

  if (current.status === "accepted") {
    if (current.social_links) {
      return (
        <div className="rounded-2xl border border-line bg-paper p-6">
          <p className="font-medium">You&apos;re all set.</p>
          <p className="mt-1 text-sm text-ink-soft">We&apos;ll be in touch once your post is live.</p>
        </div>
      );
    }
    return (
      <div className="rounded-2xl border border-line bg-paper p-6">
        <p className="font-medium">Your draft is accepted!</p>
        <p className="mt-2 text-sm text-ink-soft">Last step: send us the social links you want credited under your byline.</p>
        <SocialLinksForm onSubmitted={() => setCurrent({ ...current, social_links: "submitted" })} />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-paper p-6">
      <p className="font-medium">Your application wasn&apos;t a fit this time.</p>
      <p className="mt-1 text-sm text-ink-soft">We&apos;ll keep it on file — feel free to apply again down the line.</p>
    </div>
  );
}
