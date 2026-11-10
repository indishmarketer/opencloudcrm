"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Turnstile from "@/components/Turnstile";
import type { FormDesign, FormField } from "@/lib/formsShape";

type PublicForm = {
  id: number;
  heading: string;
  introText: string;
  fields: FormField[];
  submitLabel: string;
  successHeading: string;
  successText: string;
  verifyEmail: boolean;
  design: FormDesign;
};

/** Builds an inline-style object from a FormDesign token bag.  Only properties
 * with a non-empty value are included -- empty string means "inherit." */
function designStyles(d: FormDesign): React.CSSProperties {
  const styles: React.CSSProperties = {};
  if (d.backgroundColor) styles.backgroundColor = d.backgroundColor;
  if (d.textColor) styles.color = d.textColor;
  if (d.fontFamily) styles.fontFamily = d.fontFamily;
  return styles;
}

function inputStyles(d: FormDesign): React.CSSProperties {
  const styles: React.CSSProperties = {};
  if (d.borderColor) styles.borderColor = d.borderColor;
  if (d.borderRadius) styles.borderRadius = d.borderRadius;
  return styles;
}

function buttonStyles(d: FormDesign): React.CSSProperties {
  const styles: React.CSSProperties = {};
  if (d.buttonColor) styles.backgroundColor = d.buttonColor;
  if (d.buttonTextColor) styles.color = d.buttonTextColor;
  if (d.borderRadius) styles.borderRadius = d.borderRadius;
  return styles;
}

const baseInputClass = "mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink";

/** Renders and submits one saved form (Console → Forms), fetched by id.
 * Shared by the "savedForm" page-builder mode, the formPopup button action,
 * and the standalone /f/[slug] page -- one definition, placeable anywhere.
 *
 * When the form has verifyEmail:true the component shows a two-step flow:
 * collect fields → send OTP to the email field → visitor enters code →
 * submission recorded.  This is the same logic the original hardcoded
 * ContactFormBlock used, now available on any form. */
export default function SavedForm({ formId, showHeading = true }: { formId: number; showHeading?: boolean }) {
  const [form, setForm] = useState<PublicForm | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [turnstileToken, setTurnstileToken] = useState("");
  const handleToken = useCallback((t: string) => setTurnstileToken(t), []);

  // OTP two-step state
  const [step, setStep] = useState<"form" | "otp">("form");
  const [otpEmail, setOtpEmail] = useState("");
  const otpCodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/forms/${formId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: PublicForm) => {
        setForm(data);
        // Pre-fill hidden fields with their defaultValue
        const presets: Record<string, string> = {};
        for (const f of data.fields) {
          if (f.hidden && f.defaultValue) presets[f.key] = f.defaultValue;
        }
        if (Object.keys(presets).length) setValues((v) => ({ ...presets, ...v }));
      })
      .catch(() => setLoadError(true));
  }, [formId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form) return;

    if (form.verifyEmail) {
      // Step 1 for OTP forms: request a code, move to OTP input
      const emailField = form.fields.find((f) => f.type === "email" && !f.hidden);
      const emailValue = emailField ? (values[emailField.key] || "").trim() : "";
      if (!emailValue) {
        setStatus("error");
        setError("Please enter your email address.");
        return;
      }

      setStatus("submitting");
      setError("");
      try {
        const res = await fetch("/api/forms/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formId, pageUrl: window.location.href, fields: values, turnstileToken, step: "request-otp" }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error || "Something went wrong. Try again.");
        }
        setOtpEmail(emailValue);
        setStep("otp");
        setStatus("idle");
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      }
      return;
    }

    // Standard (non-OTP) submit
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
        throw new Error((body as { error?: string }).error || "Something went wrong. Try again.");
      }
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  }

  async function handleVerifyOtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = otpCodeRef.current?.value || "";
    setStatus("submitting");
    setError("");
    try {
      const res = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId, pageUrl: window.location.href, fields: values, turnstileToken: "", otpEmail, otpCode: code, step: "verify-otp" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || "Incorrect code.");
      }
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Incorrect code.");
    } finally {
      setStatus((s) => (s === "submitting" ? "idle" : s));
    }
  }

  if (loadError) return <p className="text-sm text-red-600">Could not load this form.</p>;
  if (!form) return <p className="text-sm text-ink-soft">Loading…</p>;

  const design = form.design || {};
  const visibleFields = form.fields.filter((f) => !f.hidden);

  if (status === "done") {
    return (
      <div style={designStyles(design)}>
        <h2 className="font-display text-2xl font-semibold">{form.successHeading || "Thanks, got it."}</h2>
        {form.successText && <p className="mt-3 text-ink-soft">{form.successText}</p>}
      </div>
    );
  }

  if (step === "otp") {
    return (
      <div style={designStyles(design)}>
        <h2 className="font-display text-2xl font-semibold">Check your email</h2>
        <p className="mt-3 text-ink-soft">
          We sent a verification code to <strong>{otpEmail}</strong>. Enter it below to submit your message.
        </p>
        <form className="mt-6 space-y-4" onSubmit={handleVerifyOtp}>
          <input
            ref={otpCodeRef}
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            placeholder="123456"
            className="w-full rounded-lg border border-line bg-paper px-4 py-3 text-center text-lg tracking-widest outline-none focus:border-ink"
            style={inputStyles(design)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={status === "submitting"}
            className="w-full rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
            style={buttonStyles(design)}
          >
            {status === "submitting" ? "Verifying…" : "Confirm and submit"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={designStyles(design)}>
      {showHeading && form.heading && <h2 className="font-display text-2xl font-semibold">{form.heading}</h2>}
      {showHeading && form.introText && <p className="mt-2 whitespace-pre-line text-ink-soft">{form.introText}</p>}
      <form className={`${(showHeading && (form.heading || form.introText)) ? "mt-6" : ""} space-y-5`} onSubmit={handleSubmit}>
        {visibleFields.map((f) => {
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
                <textarea id={id} rows={4} required={f.required} value={value} onChange={(e) => setValue(e.target.value)} className={baseInputClass} style={inputStyles(design)} />
              ) : f.type === "select" ? (
                <select id={id} required={f.required} value={value} onChange={(e) => setValue(e.target.value)} className={baseInputClass} style={inputStyles(design)}>
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
                  className={baseInputClass}
                  style={inputStyles(design)}
                />
              )}
            </div>
          );
        })}
        {status === "error" && <p className="text-sm text-red-600">{error}</p>}
        {!form.verifyEmail && <Turnstile onToken={handleToken} />}
        <button
          type="submit"
          disabled={status === "submitting" || (!form.verifyEmail && !turnstileToken)}
          className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          style={buttonStyles(design)}
        >
          {status === "submitting" ? "Sending…" : form.submitLabel}
        </button>
      </form>
    </div>
  );
}
