"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Turnstile from "@/components/Turnstile";
import type { FormCanvasElement, FormDesign, FormField } from "@/lib/formsShape";

type PublicForm = {
  id: number;
  heading: string;
  introText: string;
  fields: FormField[];
  elements?: FormCanvasElement[];
  submitLabel: string;
  successHeading: string;
  successText: string;
  submissionAction?: "message" | "redirect";
  redirectUrl?: string;
  verifyEmail: boolean;
  design: FormDesign;
};

/** Builds an inline-style object from a FormDesign token bag. Only properties
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

const baseInputClass =
  "mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink";

export default function SavedForm({
  formId,
  showHeading = true,
}: {
  formId: number;
  showHeading?: boolean;
}) {
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
        if (Array.isArray(data.elements)) {
          for (const el of data.elements) {
            if (el.type === "hidden" && el.fieldKey && el.fieldDefaultValue) {
              presets[el.fieldKey] = el.fieldDefaultValue;
            }
          }
        }
        if (Object.keys(presets).length) setValues((v) => ({ ...presets, ...v }));
      })
      .catch(() => setLoadError(true));
  }, [formId]);

  function handleSuccess(currentForm: PublicForm) {
    if (currentForm.submissionAction === "redirect" && currentForm.redirectUrl) {
      window.location.href = currentForm.redirectUrl;
      return;
    }
    setStatus("done");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form) return;

    if (form.verifyEmail) {
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
          body: JSON.stringify({
            formId,
            pageUrl: window.location.href,
            fields: values,
            turnstileToken,
            step: "request-otp",
          }),
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

    // Standard submit
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
      handleSuccess(form);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  }

  async function handleVerifyOtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form) return;
    const code = otpCodeRef.current?.value || "";
    setStatus("submitting");
    setError("");
    try {
      const res = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formId,
          pageUrl: window.location.href,
          fields: values,
          turnstileToken: "",
          otpEmail,
          otpCode: code,
          step: "verify-otp",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || "Incorrect code.");
      }
      handleSuccess(form);
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

  const hasElements = Array.isArray(form.elements) && form.elements.length > 0;
  const setValue = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  return (
    <div style={designStyles(design)}>
      {/* If canvas elements are used, render them directly in canvas order */}
      {hasElements ? (
        <form className="space-y-4" onSubmit={handleSubmit}>
          {form.elements!.map((el) => {
            if (el.type === "heading") {
              if (el.headingLevel === "h1") {
                return (
                  <h1
                    key={el.id}
                    style={{ textAlign: el.headingAlign || "left" }}
                    className="text-2xl font-bold tracking-tight text-ink"
                  >
                    {el.headingText}
                  </h1>
                );
              }
              if (el.headingLevel === "h3") {
                return (
                  <h3
                    key={el.id}
                    style={{ textAlign: el.headingAlign || "left" }}
                    className="text-lg font-semibold text-ink"
                  >
                    {el.headingText}
                  </h3>
                );
              }
              if (el.headingLevel === "h4") {
                return (
                  <h4
                    key={el.id}
                    style={{ textAlign: el.headingAlign || "left" }}
                    className="text-base font-semibold text-ink"
                  >
                    {el.headingText}
                  </h4>
                );
              }
              return (
                <h2
                  key={el.id}
                  style={{ textAlign: el.headingAlign || "left" }}
                  className="text-xl font-bold tracking-tight text-ink"
                >
                  {el.headingText}
                </h2>
              );
            }

            if (el.type === "text") {
              return (
                <p
                  key={el.id}
                  style={{ textAlign: el.textAlign || "left" }}
                  className={`text-sm ${el.textMuted ? "text-ink-soft" : "text-ink"}`}
                >
                  {el.textContent}
                </p>
              );
            }

            if (el.type === "divider") {
              return (
                <div
                  key={el.id}
                  className={
                    el.dividerSpacing === "lg" ? "py-4" : el.dividerSpacing === "sm" ? "py-1" : "py-2"
                  }
                >
                  <hr className="border-line" />
                </div>
              );
            }

            if (el.type === "hidden") {
              return (
                <input
                  key={el.id}
                  type="hidden"
                  name={el.fieldKey}
                  value={values[el.fieldKey || ""] || el.fieldDefaultValue || ""}
                />
              );
            }

            if (el.type === "button") {
              return (
                <div
                  key={el.id}
                  className={`flex ${
                    el.buttonAlign === "center"
                      ? "justify-center"
                      : el.buttonAlign === "right"
                        ? "justify-end"
                        : el.buttonAlign === "left"
                          ? "justify-start"
                          : "w-full"
                  } pt-2`}
                >
                  <button
                    type="submit"
                    disabled={status === "submitting" || (!form.verifyEmail && !turnstileToken)}
                    className={`${
                      el.buttonAlign === "full" ? "w-full" : ""
                    } rounded-xl bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50`}
                    style={buttonStyles(design)}
                  >
                    {status === "submitting" ? "Sending…" : el.buttonLabel || "Submit"}
                  </button>
                </div>
              );
            }

            // Input fields
            const key = el.fieldKey || el.id;
            const inputId = `saved-form-${form.id}-${key}`;
            const val = values[key] || "";

            return (
              <div key={el.id}>
                {el.type !== "checkbox" && (
                  <label className="text-sm font-medium" htmlFor={inputId}>
                    {el.fieldLabel}
                    {el.fieldRequired && <span className="text-red-500"> *</span>}
                  </label>
                )}

                {el.type === "textarea" ? (
                  <textarea
                    id={inputId}
                    rows={4}
                    required={el.fieldRequired}
                    placeholder={el.fieldPlaceholder}
                    value={val}
                    onChange={(e) => setValue(key, e.target.value)}
                    className={baseInputClass}
                    style={inputStyles(design)}
                  />
                ) : el.type === "select" ? (
                  <select
                    id={inputId}
                    required={el.fieldRequired}
                    value={val}
                    onChange={(e) => setValue(key, e.target.value)}
                    className={baseInputClass}
                    style={inputStyles(design)}
                  >
                    <option value="">Choose…</option>
                    {(el.fieldOptions || "")
                      .split(",")
                      .map((o) => o.trim())
                      .filter(Boolean)
                      .map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                  </select>
                ) : el.type === "checkbox" ? (
                  <label className="inline-flex items-center gap-2 text-sm font-medium" htmlFor={inputId}>
                    <input
                      id={inputId}
                      type="checkbox"
                      required={el.fieldRequired}
                      checked={val === "true"}
                      onChange={(e) => setValue(key, e.target.checked ? "true" : "false")}
                      className="h-4 w-4 rounded border-line"
                    />
                    {el.fieldLabel}
                    {el.fieldRequired && <span className="text-red-500"> *</span>}
                  </label>
                ) : (
                  <input
                    id={inputId}
                    type={
                      el.type === "email"
                        ? "email"
                        : el.type === "phone"
                          ? "tel"
                          : el.type === "number"
                            ? "number"
                            : "text"
                    }
                    required={el.fieldRequired}
                    placeholder={el.fieldPlaceholder}
                    value={val}
                    onChange={(e) => setValue(key, e.target.value)}
                    className={baseInputClass}
                    style={inputStyles(design)}
                  />
                )}
              </div>
            );
          })}

          {status === "error" && <p className="text-sm text-red-600">{error}</p>}
          {!form.verifyEmail && <Turnstile onToken={handleToken} />}

          {/* Fallback button if canvas has no button element */}
          {!form.elements!.some((e) => e.type === "button") && (
            <button
              type="submit"
              disabled={status === "submitting" || (!form.verifyEmail && !turnstileToken)}
              className="w-full rounded-xl bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
              style={buttonStyles(design)}
            >
              {status === "submitting" ? "Sending…" : form.submitLabel || "Submit"}
            </button>
          )}
        </form>
      ) : (
        /* Classic / legacy fallback */
        <>
          {showHeading && form.heading && (
            <h2 className="font-display text-2xl font-semibold">{form.heading}</h2>
          )}
          {showHeading && form.introText && (
            <p className="mt-2 whitespace-pre-line text-ink-soft">{form.introText}</p>
          )}
          <form
            className={`${showHeading && (form.heading || form.introText) ? "mt-6" : ""} space-y-5`}
            onSubmit={handleSubmit}
          >
            {form.fields
              .filter((f) => !f.hidden)
              .map((f) => {
                const id = `saved-form-${form.id}-${f.key}`;
                const value = values[f.key] || "";
                return (
                  <div key={f.key}>
                    {f.type !== "checkbox" && (
                      <label className="text-sm font-medium" htmlFor={id}>
                        {f.label}
                        {f.required && <span className="text-red-500"> *</span>}
                      </label>
                    )}
                    {f.type === "textarea" ? (
                      <textarea
                        id={id}
                        rows={4}
                        required={f.required}
                        value={value}
                        onChange={(e) => setValue(f.key, e.target.value)}
                        className={baseInputClass}
                        style={inputStyles(design)}
                      />
                    ) : f.type === "select" ? (
                      <select
                        id={id}
                        required={f.required}
                        value={value}
                        onChange={(e) => setValue(f.key, e.target.value)}
                        className={baseInputClass}
                        style={inputStyles(design)}
                      >
                        <option value="">Choose…</option>
                        {f.options
                          .split(",")
                          .map((o) => o.trim())
                          .filter(Boolean)
                          .map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                      </select>
                    ) : f.type === "checkbox" ? (
                      <label className="inline-flex items-center gap-2 text-sm font-medium" htmlFor={id}>
                        <input
                          id={id}
                          type="checkbox"
                          required={f.required}
                          checked={value === "true"}
                          onChange={(e) => setValue(f.key, e.target.checked ? "true" : "false")}
                          className="h-4 w-4"
                        />
                        {f.label}
                        {f.required && <span className="text-red-500"> *</span>}
                      </label>
                    ) : (
                      <input
                        id={id}
                        type={
                          f.type === "email"
                            ? "email"
                            : f.type === "phone"
                              ? "tel"
                              : f.type === "number"
                                ? "number"
                                : f.type === "date"
                                  ? "date"
                                  : "text"
                        }
                        required={f.required}
                        value={value}
                        onChange={(e) => setValue(f.key, e.target.value)}
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
        </>
      )}
    </div>
  );
}
