"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/gtag";

export default function AuthorApplicationForm() {
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const form = e.currentTarget;
    const topics = (form.elements.namedItem("topics") as HTMLTextAreaElement).value;
    const sampleUrl = (form.elements.namedItem("sampleUrl") as HTMLInputElement).value;

    try {
      const res = await fetch("/api/author-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topics, sampleUrl: sampleUrl || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Something went wrong.");
      trackEvent("generate_lead", { form: "author_application" });
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-line bg-paper p-6 text-center">
        <p className="font-medium">Application sent.</p>
        <p className="mt-1 text-sm text-ink-soft">We&apos;ll email you if it&apos;s a fit.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium">What would you want to write about?</label>
        <textarea
          name="topics"
          required
          rows={5}
          placeholder="Topics, angles, or a rough pitch…"
          className="mt-1.5 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
        />
      </div>
      <div>
        <label className="text-sm font-medium">Writing sample (optional)</label>
        <input
          name="sampleUrl"
          type="url"
          placeholder="https://…"
          className="mt-1.5 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={status === "submitting"}
        className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {status === "submitting" ? "Sending…" : "Apply"}
      </button>
    </form>
  );
}
