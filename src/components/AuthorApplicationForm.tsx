"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import Turnstile from "@/components/Turnstile";
import { trackEvent } from "@/lib/gtag";

const field = "mt-2 w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm outline-none transition-colors placeholder:text-ink-soft/65 focus:border-accent";

export default function AuthorApplicationForm() {
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [manageUrl, setManageUrl] = useState("");
  const onToken = useCallback((token: string) => setTurnstileToken(token), []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError("");
    const form = new FormData(event.currentTarget);
    form.set("turnstileToken", turnstileToken);
    try {
      const response = await fetch("/api/author-applications", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Something went wrong.");
      setManageUrl(body.manageUrl || "");
      setStatus("done");
      trackEvent("generate_lead", { form: "author_application" });
    } catch (submissionError) {
      setStatus("error");
      setError(submissionError instanceof Error ? submissionError.message : "Something went wrong.");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-3xl border border-accent/25 bg-accent-soft p-7 sm:p-9" role="status">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Application received</p>
        <h3 className="mt-3 font-display text-2xl font-semibold">We will read it carefully.</h3>
        <p className="mt-3 max-w-xl leading-7 text-ink-soft">
          Check your inbox for a private application link. If we approve your application, you will use that same link to send the full draft. No account is needed.
        </p>
        {manageUrl && (
          <Link href={manageUrl} className="mt-6 inline-flex rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-on hover:opacity-90">
            View application status
          </Link>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border border-line bg-paper p-6 shadow-[0_24px_70px_-45px_rgba(109,40,217,0.45)] sm:p-9">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Your name
          <input className={field} name="name" autoComplete="name" maxLength={120} required placeholder="How your byline should read" />
        </label>
        <label className="text-sm font-medium">
          Email address
          <input className={field} name="email" type="email" autoComplete="email" maxLength={320} required placeholder="you@example.com" />
        </label>
      </div>

      <label className="mt-5 block text-sm font-medium">
        What do you want to write about?
        <textarea className={field} name="topics" rows={5} minLength={30} maxLength={3000} required placeholder="Share the topic, the useful angle, and the experience behind it." />
      </label>

      <fieldset className="mt-7 rounded-2xl border border-line bg-paper-soft/60 p-5">
        <legend className="px-2 text-sm font-semibold">Add one writing sample</legend>
        <p className="mt-1 text-sm leading-6 text-ink-soft">A published link, a pasted excerpt, or a document is enough. You can include more than one.</p>
        <label className="mt-5 block text-sm font-medium">
          Published link
          <input className={field} name="sampleUrl" type="url" maxLength={500} placeholder="Medium, Substack, your blog, or a public Google Doc" />
        </label>
        <label className="mt-5 block text-sm font-medium">
          Paste a sample
          <textarea className={field} name="sampleText" rows={6} maxLength={12000} placeholder="Paste a short post or an excerpt here." />
        </label>
        <label className="mt-5 block text-sm font-medium">
          Upload a document
          <input className={`${field} file:mr-4 file:rounded-full file:border-0 file:bg-accent-soft file:px-4 file:py-2 file:text-xs file:font-semibold file:text-accent`} name="sampleFile" type="file" accept=".pdf,.doc,.docx,.odt,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,text/plain,text/markdown" />
          <span className="mt-2 block text-xs font-normal text-ink-soft">PDF, DOC, DOCX, ODT, TXT, or Markdown. Maximum 10 MB.</span>
        </label>
      </fieldset>

      <div className="mt-6"><Turnstile onToken={onToken} /></div>
      {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      <button type="submit" disabled={status === "submitting" || !turnstileToken} className="mt-6 w-full rounded-full bg-accent px-6 py-3.5 text-sm font-semibold text-accent-on shadow-[0_12px_28px_-14px_var(--accent)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
        {status === "submitting" ? "Sending application..." : "Apply to write"}
      </button>
      <p className="mt-4 text-center text-xs leading-5 text-ink-soft">We use your details only to review your application and manage the editorial process.</p>
    </form>
  );
}
