"use client";

import { useCallback, useEffect, useState } from "react";
import Turnstile from "@/components/Turnstile";
import type { FormField } from "@/lib/formsShape";

type PublicForm = {
  id: number;
  heading: string;
  introText: string;
  fields: FormField[];
  submitLabel: string;
  successHeading: string;
  successText: string;
};

const inputClass = "mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink";

/** Renders and submits one saved form (Console -> Forms), fetched by id.
 * Shared by the "savedForm" page-builder mode and the formPopup button
 * action -- one definition, placeable in either spot. */
export default function SavedForm({ formId, heading: headingOverride }: { formId: number; heading?: boolean }) {
  const [form, setForm] = useState<PublicForm | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [turnstileToken, setTurnstileToken] = useState("");
  const handleToken = useCallback((t: string) => setTurnstileToken(t), []);

  useEffect(() => {
    fetch(`/api/forms/${formId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setForm(data))
      .catch(() => setLoadError(true));
  }, [formId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    try {
      const res = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId, pageUrl: window.location.href, fields: values, turnstileToken }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong. Try again.");
      }
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  }

  if (loadError) return <p className="text-sm text-red-600">Could not load this form.</p>;
  if (!form) return <p className="text-sm text-ink-soft">Loading…</p>;

  if (status === "done") {
    return (
      <div>
        <h2 className="font-display text-2xl font-semibold">{form.successHeading || "Thanks, got it."}</h2>
        {form.successText && <p className="mt-3 text-ink-soft">{form.successText}</p>}
      </div>
    );
  }

  return (
    <div>
      {headingOverride !== false && form.heading && <h2 className="font-display text-2xl font-semibold">{form.heading}</h2>}
      {headingOverride !== false && form.introText && <p className="mt-2 whitespace-pre-line text-ink-soft">{form.introText}</p>}
      <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
        {form.fields.map((f) => {
          const id = `saved-form-${form.id}-${f.key}`;
          const value = values[f.key] || "";
          const setValue = (v: string) => setValues((prev) => ({ ...prev, [f.key]: v }));
          return (
            <div key={f.key}>
              {f.type !== "checkbox" && (
                <label className="text-sm font-medium" htmlFor={id}>
                  {f.label}
                  {f.required && <span className="text-red-500"> *</span>}
                </label>
              )}
              {f.type === "textarea" ? (
                <textarea id={id} rows={4} required={f.required} value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} />
              ) : f.type === "select" ? (
                <select id={id} required={f.required} value={value} onChange={(e) => setValue(e.target.value)} className={inputClass}>
                  <option value="">Choose…</option>
                  {f.options.split(",").map((o) => o.trim()).filter(Boolean).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : f.type === "checkbox" ? (
                <label className="inline-flex items-center gap-2 text-sm font-medium" htmlFor={id}>
                  <input id={id} type="checkbox" required={f.required} checked={value === "true"} onChange={(e) => setValue(e.target.checked ? "true" : "false")} className="h-4 w-4" />
                  {f.label}
                  {f.required && <span className="text-red-500"> *</span>}
                </label>
              ) : (
                <input
                  id={id}
                  type={f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  required={f.required}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className={inputClass}
                />
              )}
            </div>
          );
        })}
        {status === "error" && <p className="text-sm text-red-600">{error}</p>}
        <Turnstile onToken={handleToken} />
        <button
          type="submit"
          disabled={status === "submitting" || !turnstileToken}
          className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {status === "submitting" ? "Sending…" : form.submitLabel}
        </button>
      </form>
    </div>
  );
}
