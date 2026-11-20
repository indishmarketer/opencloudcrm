"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/gtag";
import AuthorApplicationForm from "@/components/AuthorApplicationForm";
import type { AuthorApplicationStatus } from "@/lib/authorApplications";

type Application = {
  id: number;
  status: AuthorApplicationStatus;
  submission_url: string | null;
  submission_note: string | null;
  submission_file_name: string | null;
  admin_note: string | null;
  social_links: string | null;
};

const field = "mt-2 w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-accent";

function DraftSubmissionForm({ token, onSubmitted }: { token: string | null; onSubmitted: () => void }) {
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError("");
    const form = new FormData(event.currentTarget);
    if (token) form.set("token", token);
    try {
      const response = await fetch("/api/author-applications/submission", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Something went wrong.");
      trackEvent("generate_lead", { form: "author_draft_submission" });
      onSubmitted();
    } catch (submissionError) {
      setStatus("error");
      setError(submissionError instanceof Error ? submissionError.message : "Something went wrong.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5">
      <label className="block text-sm font-medium">Draft link<input className={field} name="submissionUrl" type="url" maxLength={500} placeholder="Public Google Doc, Notion page, Medium draft, or website link" /></label>
      <div className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">or</div>
      <label className="block text-sm font-medium">Upload your draft<input className={`${field} file:mr-4 file:rounded-full file:border-0 file:bg-accent-soft file:px-4 file:py-2 file:text-xs file:font-semibold file:text-accent`} name="submissionFile" type="file" accept=".pdf,.doc,.docx,.odt,.txt,.md" /><span className="mt-2 block text-xs font-normal text-ink-soft">PDF, DOC, DOCX, ODT, TXT, or Markdown. Maximum 10 MB.</span></label>
      <label className="block text-sm font-medium">Note for the editor <span className="font-normal text-ink-soft">(optional)</span><textarea className={field} name="note" rows={3} maxLength={2000} placeholder="Add context, source notes, or anything we should know." /></label>
      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={status === "submitting"} className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-on hover:opacity-90 disabled:opacity-50">{status === "submitting" ? "Submitting draft..." : "Submit draft"}</button>
    </form>
  );
}

function SocialLinksForm({ token, onSubmitted }: { token: string | null; onSubmitted: () => void }) {
  const [links, setLinks] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/author-applications/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ socialLinks: links, token }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Something went wrong.");
      onSubmitted();
    } catch (submissionError) { setError(submissionError instanceof Error ? submissionError.message : "Something went wrong."); setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-6"><label className="block text-sm font-medium">Website and social links<textarea className={field} rows={4} required value={links} onChange={(event) => setLinks(event.target.value)} placeholder="One link per line. Add only what you want shown with your byline." /></label>{error && <p className="mt-3 text-sm text-red-600">{error}</p>}<button disabled={busy} className="mt-4 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-on disabled:opacity-50">{busy ? "Saving..." : "Save byline links"}</button></form>;
}

export default function AuthorApplicationFlow({ application, token }: { application: Application | null; token: string | null }) {
  const [current, setCurrent] = useState(application);
  if (!current) return <AuthorApplicationForm />;
  const box = "rounded-3xl border border-line bg-paper p-7 shadow-[0_24px_70px_-45px_rgba(109,40,217,0.4)] sm:p-9";

  if (current.status === "pending") return <div className={box}><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Under review</p><h3 className="mt-3 font-display text-2xl font-semibold">Your application is in the queue.</h3><p className="mt-3 leading-7 text-ink-soft">A person will read your pitch and sample. We will email you when there is an update.</p></div>;
  if (current.status === "approved" || current.status === "changes_requested") return <div className={box}><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Approved to write</p><h3 className="mt-3 font-display text-2xl font-semibold">Send us your full draft.</h3>{current.status === "changes_requested" && current.admin_note && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Changes requested:</strong> {current.admin_note}</p>}<p className="mt-3 leading-7 text-ink-soft">Share a public draft link or upload the document here. You still do not need an account.</p><DraftSubmissionForm token={token} onSubmitted={() => setCurrent({ ...current, status: "draft_submitted" })} /></div>;
  if (current.status === "draft_submitted") return <div className={box}><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Draft received</p><h3 className="mt-3 font-display text-2xl font-semibold">We are reading your draft.</h3><p className="mt-3 leading-7 text-ink-soft">We will email you if it is accepted or if we need a revision.</p>{current.submission_url && <a href={current.submission_url} target="_blank" rel="noopener noreferrer" className="mt-5 inline-block text-sm font-semibold text-accent underline underline-offset-4">Open submitted link</a>}{current.submission_file_name && <a href={`/api/author-applications/file?id=${current.id}&kind=submission${token ? `&token=${encodeURIComponent(token)}` : ""}`} className="mt-5 block text-sm font-semibold text-accent underline underline-offset-4">Download {current.submission_file_name}</a>}</div>;
  if (current.status === "accepted") return <div className={box}><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Draft accepted</p><h3 className="mt-3 font-display text-2xl font-semibold">One last step for your byline.</h3>{current.social_links ? <p className="mt-3 leading-7 text-ink-soft">Your links are saved. We will contact you when the post is ready to publish.</p> : <><p className="mt-3 leading-7 text-ink-soft">Add the website and social links you want readers to see with your author profile.</p><SocialLinksForm token={token} onSubmitted={() => setCurrent({ ...current, social_links: "submitted" })} /></>}</div>;
  return <div className={box}><p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">Application reviewed</p><h3 className="mt-3 font-display text-2xl font-semibold">It is not the right fit this time.</h3><p className="mt-3 leading-7 text-ink-soft">Thank you for sharing your work with us. You are welcome to apply again later with a different angle or a stronger sample.</p></div>;
}
