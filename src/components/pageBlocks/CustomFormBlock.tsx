"use client";

import { useState } from "react";
import Turnstile from "@/components/Turnstile";

export type CustomFormField = { label: string; type: string; options?: string; required?: boolean };

/** A Form element in "custom" mode: whatever fields the owner defined in
 * the console, not the fixed name/email/message of the contact form.
 * Submits straight to /api/forms/submit -- no OTP step (that exists for
 * contact-form lead-capture spam resistance specifically), no Contact
 * record. The owner gets it as a console inbox alert + email, same as
 * any other "something came in" event. */
export default function CustomFormBlock({
  heading,
  text,
  fields,
  successHeading,
  successText,
}: {
  heading: string;
  text: string;
  fields: CustomFormField[];
  successHeading: string;
  successText: string;
}) {
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  if (!fields.length) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const form = e.currentTarget;
    const values: Record<string, string> = {};
    fields.forEach((f, i) => {
      const el = form.elements.namedItem(`field_${i}`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      values[f.label || `Field ${i + 1}`] = el ? el.value : "";
    });
    try {
      const res = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageUrl: window.location.href, formHeading: heading, fields: values, turnstileToken }),
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

  if (status === "done") {
    return (
      <div className="max-w-2xl">
        <h2 className="font-display text-4xl font-semibold">{successHeading || "Thanks, got it."}</h2>
        {successText && <p className="mt-3 text-ink-soft">{successText}</p>}
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      {heading && <h2 className="font-display text-4xl font-semibold">{heading}</h2>}
      {text && <p className="mt-3 whitespace-pre-line text-ink-soft">{text}</p>}
      <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
        {fields.map((f, i) => {
          const id = `field_${i}`;
          const inputClass = "mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink";
          return (
            <div key={i}>
              <label className="text-sm font-medium" htmlFor={id}>
                {f.label || `Field ${i + 1}`}
                {f.required && <span className="text-red-500"> *</span>}
              </label>
              {f.type === "textarea" ? (
                <textarea id={id} name={id} rows={4} required={f.required} className={inputClass} />
              ) : f.type === "select" ? (
                <select id={id} name={id} required={f.required} className={inputClass}>
                  <option value="">Choose…</option>
                  {(f.options || "")
                    .split(",")
                    .map((o) => o.trim())
                    .filter(Boolean)
                    .map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                </select>
              ) : (
                <input
                  id={id}
                  name={id}
                  type={f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text"}
                  required={f.required}
                  className={inputClass}
                />
              )}
            </div>
          );
        })}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Turnstile onToken={setTurnstileToken} />
        <button
          type="submit"
          disabled={status === "submitting" || !turnstileToken}
          className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {status === "submitting" ? "Sending…" : "Submit"}
        </button>
      </form>
    </div>
  );
}
