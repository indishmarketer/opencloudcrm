"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Turnstile from "@/components/Turnstile";
import type { FormCanvasElement, FormDesign, FormField } from "@/lib/formsShape";
import {
  elementButtonStyle,
  elementInputStyle,
  elementTextStyle,
  elementWrapperStyle,
  hasCustomWidth,
} from "@/lib/formElementStyles";
import { listCountryDialOptions } from "@/lib/countryDialCodes";

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

function parseChoices(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).map((s) => s.trim()).filter(Boolean);
  } catch {}
  if (raw.includes("\n")) {
    return raw.split("\n").map((s) => s.trim()).filter(Boolean);
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function designStyles(d: FormDesign): React.CSSProperties {
  const styles: React.CSSProperties = {};
  if (d.backgroundColor) styles.backgroundColor = d.backgroundColor;
  if (d.textColor) styles.color = d.textColor;
  if (d.fontFamily) styles.fontFamily = d.fontFamily;
  return styles;
}

/** Thin aliases kept so the many call sites below read the same as before;
 * the real work (padding, size, spacing, typography, border) lives in
 * src/lib/formElementStyles.ts and is shared with the console canvas. */
const inputStyles = (d: FormDesign, elStyle?: FormCanvasElement["elementStyle"]) => elementInputStyle(d, elStyle);
const buttonStyles = (d: FormDesign, elStyle?: FormCanvasElement["elementStyle"]) => elementButtonStyle(d, elStyle);

const baseInputClass =
  "mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink transition-colors";

/** A field's own label follows its text colour and font size so restyling an
 * element restyles the whole field, not just its input box. */
function labelStyle(el: FormCanvasElement): React.CSSProperties {
  return {
    color: el.elementStyle?.textColor || undefined,
    fontSize: el.elementStyle?.fontSize || undefined,
    fontWeight: el.elementStyle?.fontWeight || undefined,
    textAlign: el.elementStyle?.textAlign || undefined,
    display: el.elementStyle?.textAlign ? "block" : undefined,
  };
}

function CountryPicker({
  value,
  onChange,
  style,
  id,
}: {
  value: string;
  onChange: (code: string) => void;
  style?: React.CSSProperties;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = useMemo(() => listCountryDialOptions(), []);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const selected = options.find((o) => o.code === value) || options.find((o) => o.code === "IN") || options[0];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q) || o.code.toLowerCase() === q);
  }, [options, query]);

  return (
    <div ref={ref} className="relative mt-2">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-paper px-4 py-3 text-left text-sm text-ink outline-none transition-colors hover:border-ink focus:border-ink"
        style={style}
      >
        <span className="flex items-center gap-2 truncate">
          <span>{selected ? selected.flag : "🌐"}</span>
          <span>{selected ? selected.name : "Select country"}</span>
        </span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-line bg-white shadow-xl">
          <div className="sticky top-0 border-b border-line bg-white p-2">
            <input
              type="text"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search countries…"
              className="w-full rounded-md border border-line px-3 py-1.5 text-xs text-ink outline-none focus:border-ink"
            />
          </div>
          <div className="py-1">
            {filtered.slice(0, 100).map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => {
                  onChange(opt.code);
                  setOpen(false);
                  setQuery("");
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-paper-soft ${
                  opt.code === value ? "bg-stone-100 font-semibold text-ink" : "text-ink"
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <span>{opt.flag}</span>
                  <span>{opt.name}</span>
                </span>
                <span className="font-mono text-ink-soft text-[11px]">{opt.dialCode}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PhoneFieldInput({
  value,
  onChange,
  countryCode,
  onCountryCodeChange,
  placeholder,
  required,
  id,
  style,
}: {
  value: string;
  onChange: (val: string) => void;
  countryCode: string;
  onCountryCodeChange: (code: string) => void;
  placeholder?: string;
  required?: boolean;
  id?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const allCountries = useMemo(() => listCountryDialOptions(), []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const activeOption = allCountries.find((c) => c.code === countryCode) || allCountries.find((c) => c.code === "IN") || allCountries[0];
  const dialCode = activeOption ? activeOption.dialCode : "+1";

  // If value contains dial code, strip it for the raw input box
  const rawNumber = value.startsWith(dialCode) ? value.slice(dialCode.length).trim() : value;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allCountries;
    return allCountries.filter((c) => c.name.toLowerCase().includes(q) || c.dialCode.includes(q) || c.code.toLowerCase() === q);
  }, [allCountries, search]);

  return (
    <div ref={containerRef} className="relative mt-2 flex gap-2">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-sm text-ink outline-none transition-colors hover:border-ink focus:border-ink"
        style={style}
      >
        <span className="text-base">{activeOption?.flag || "🌐"}</span>
        <span className="font-mono text-xs font-medium text-ink">{dialCode}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <input
        id={id}
        type="tel"
        required={required}
        placeholder={placeholder || "Phone number"}
        value={rawNumber}
        onChange={(e) => {
          const num = e.target.value;
          onChange(num ? `${dialCode} ${num.trim()}` : "");
        }}
        className="flex-1 rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none transition-colors focus:border-ink"
        style={style}
      />

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-60 w-72 overflow-y-auto rounded-lg border border-line bg-white shadow-xl">
          <div className="sticky top-0 border-b border-line bg-white p-2">
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code or country…"
              className="w-full rounded-md border border-line px-3 py-1.5 text-xs text-ink outline-none focus:border-ink"
            />
          </div>
          <div className="py-1">
            {filtered.slice(0, 100).map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => {
                  onCountryCodeChange(opt.code);
                  setOpen(false);
                  setSearch("");
                  if (rawNumber) {
                    onChange(`${opt.dialCode} ${rawNumber.trim()}`);
                  }
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-paper-soft ${
                  opt.code === countryCode ? "bg-stone-100 font-semibold text-ink" : "text-ink"
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <span>{opt.flag}</span>
                  <span className="truncate">{opt.name}</span>
                </span>
                <span className="font-mono text-ink-soft text-[11px] shrink-0 ml-2">{opt.dialCode}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SavedForm({
  formId,
  showHeading = true,
  designOverride,
}: {
  formId: number;
  showHeading?: boolean;
  designOverride?: Partial<FormDesign>;
}) {
  const [form, setForm] = useState<PublicForm | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [turnstileToken, setTurnstileToken] = useState("");
  const handleToken = useCallback((t: string) => setTurnstileToken(t), []);
  /** A Turnstile token is single-use: the server spends it on the first
   * request and a retry with the same one fails verification. Bumping this
   * remounts the widget so a visitor who hits a validation error can submit
   * again instead of being stuck on "Could not verify you're human". */
  const [turnstileNonce, setTurnstileNonce] = useState(0);
  const freshChallenge = useCallback(() => {
    setTurnstileToken("");
    setTurnstileNonce((n) => n + 1);
  }, []);

  // OTP two-step state
  const [step, setStep] = useState<"form" | "otp">("form");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpNotice, setOtpNotice] = useState("");
  const otpCodeRef = useRef<HTMLInputElement>(null);
  const [selectedPhoneCountry, setSelectedPhoneCountry] = useState<Record<string, string>>({});

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

  /** Sends the form to the server. Both flows post the same body -- with
   * email verification on, the server answers with step:"verify-otp"
   * instead of recording the submission, and the visitor gets the code
   * screen. Either way a Turnstile token is required and spent. */
  async function postForm(currentForm: PublicForm): Promise<boolean> {
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
          ...(currentForm.verifyEmail ? { step: "request-otp" as const } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; step?: string; email?: string };
      if (!res.ok) throw new Error(body.error || "Something went wrong. Try again.");

      if (body.step === "verify-otp") {
        setOtpEmail(body.email || "");
        setStep("otp");
        setStatus("idle");
        // Re-arm the challenge so "Send a new code" has a token of its own.
        freshChallenge();
        return true;
      }
      handleSuccess(currentForm);
      return true;
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      // The token this attempt carried is spent either way.
      freshChallenge();
      return false;
    }
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
    }
    await postForm(form);
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

  const design = { ...(form.design || {}), ...designOverride };

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
          We sent a 6-digit code to <strong>{otpEmail}</strong>. Enter it below, or just click the
          confirmation link in that email — either one finishes your submission.
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
          {otpNotice && <p className="text-sm text-ink-soft">{otpNotice}</p>}
          <button
            type="submit"
            disabled={status === "submitting"}
            className="w-full rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
            style={buttonStyles(design)}
          >
            {status === "submitting" ? "Verifying…" : "Confirm and submit"}
          </button>
        </form>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
          <button
            type="button"
            disabled={status === "submitting" || !turnstileToken}
            onClick={async () => {
              setOtpNotice("");
              const sent = await postForm(form);
              if (sent) setOtpNotice(`A new code is on its way to ${otpEmail}.`);
            }}
            className="underline text-ink-soft hover:text-ink disabled:opacity-50"
          >
            Send a new code
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("form");
              setError("");
              setOtpNotice("");
              setStatus("idle");
              freshChallenge();
            }}
            className="underline text-ink-soft hover:text-ink"
          >
            Change my answers
          </button>
        </div>
        {/* The resend above posts the form again, which needs its own token. */}
        <div className="mt-3">
          <Turnstile key={turnstileNonce} onToken={handleToken} />
        </div>
      </div>
    );
  }

  const hasElements = Array.isArray(form.elements) && form.elements.length > 0;
  const setValue = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  function handleCountrySelect(countryCode: string) {
    if (!form) return;
    const phoneElements = form.elements?.filter((e) => e.type === "phone") || [];
    if (phoneElements.length > 0) {
      setSelectedPhoneCountry((prev) => {
        const next = { ...prev };
        for (const p of phoneElements) {
          const pKey = p.fieldKey || p.id;
          next[pKey] = countryCode;
        }
        return next;
      });
    }
  }

  return (
    <div style={designStyles(design)}>
      {/* If canvas elements are used, render them directly in canvas order */}
      {hasElements ? (
        <form className="space-y-4" onSubmit={handleSubmit}>
          {form.elements!.map((el) => {
            if (el.type === "heading") {
              const hStyle: React.CSSProperties = {
                textAlign: el.elementStyle?.textAlign || el.headingAlign || "left",
                ...elementTextStyle(design, el.elementStyle),
                ...elementWrapperStyle(el.elementStyle),
              };
              if (el.headingLevel === "h1") {
                return (
                  <h1 key={el.id} style={hStyle} className="text-2xl font-bold tracking-tight text-ink">
                    {el.headingText}
                  </h1>
                );
              }
              if (el.headingLevel === "h3") {
                return (
                  <h3 key={el.id} style={hStyle} className="text-lg font-semibold text-ink">
                    {el.headingText}
                  </h3>
                );
              }
              if (el.headingLevel === "h4") {
                return (
                  <h4 key={el.id} style={hStyle} className="text-base font-semibold text-ink">
                    {el.headingText}
                  </h4>
                );
              }
              return (
                <h2 key={el.id} style={hStyle} className="text-xl font-bold tracking-tight text-ink">
                  {el.headingText}
                </h2>
              );
            }

            if (el.type === "text") {
              return (
                <p
                  key={el.id}
                  style={{
                    textAlign: el.elementStyle?.textAlign || el.textAlign || "left",
                    ...elementTextStyle(design, el.elementStyle),
                    ...elementWrapperStyle(el.elementStyle),
                  }}
                  className={`text-sm whitespace-pre-wrap ${el.textMuted ? "text-ink-soft" : "text-ink"}`}
                >
                  {el.textContent}
                </p>
              );
            }

            if (el.type === "divider") {
              return (
                <div
                  key={el.id}
                  style={elementWrapperStyle(el.elementStyle)}
                  className={
                    el.dividerSpacing === "lg" ? "py-4" : el.dividerSpacing === "sm" ? "py-1" : "py-2"
                  }
                >
                  <hr
                    className="border-line"
                    style={{
                      borderColor: el.elementStyle?.borderColor || design.borderColor || undefined,
                      borderTopWidth: el.elementStyle?.borderWidth || undefined,
                      width: el.elementStyle?.width || undefined,
                    }}
                  />
                </div>
              );
            }

            if (el.type === "hidden" || el.fieldHidden) {
              const hKey = el.fieldKey || el.id;
              return (
                <input
                  key={el.id}
                  type="hidden"
                  name={hKey}
                  value={values[hKey] || el.fieldDefaultValue || ""}
                />
              );
            }

            if (el.type === "button") {
              // A custom width wins over "full width": a visitor who set an
              // explicit size meant that size, not the container's.
              const fullWidth = el.buttonAlign === "full" && !hasCustomWidth(el.elementStyle);
              return (
                <div
                  key={el.id}
                  style={elementWrapperStyle(el.elementStyle)}
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
                    disabled={status === "submitting" || !turnstileToken}
                    className={`${fullWidth ? "w-full" : ""} ${
                      el.elementStyle?.paddingX || el.elementStyle?.padding ? "" : "px-6"
                    } ${
                      el.elementStyle?.paddingY || el.elementStyle?.padding || el.elementStyle?.height ? "" : "py-3"
                    } rounded-xl bg-ink text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50`}
                    style={buttonStyles(design, el.elementStyle)}
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
            const choices = parseChoices(el.fieldOptions);

            if (el.type === "country") {
              return (
                <div key={el.id} style={elementWrapperStyle(el.elementStyle)}>
                  <label className="text-sm font-medium" style={labelStyle(el)} htmlFor={inputId}>
                    {el.fieldLabel || "Country"}
                  </label>
                  <CountryPicker
                    id={inputId}
                    value={val}
                    onChange={(code) => {
                      setValue(key, code);
                      handleCountrySelect(code);
                    }}
                    style={inputStyles(design, el.elementStyle)}
                  />
                </div>
              );
            }

            if (el.type === "phone") {
              return (
                <div key={el.id} style={elementWrapperStyle(el.elementStyle)}>
                  <label className="text-sm font-medium" style={labelStyle(el)} htmlFor={inputId}>
                    {el.fieldLabel || "Phone number"}
                  </label>
                  <PhoneFieldInput
                    id={inputId}
                    value={val}
                    countryCode={selectedPhoneCountry[key] || "IN"}
                    onCountryCodeChange={(code) => {
                      setSelectedPhoneCountry((prev) => ({ ...prev, [key]: code }));
                    }}
                    onChange={(phoneVal) => setValue(key, phoneVal)}
                    placeholder={el.fieldPlaceholder}
                    required={el.fieldRequired}
                    style={inputStyles(design, el.elementStyle)}
                  />
                </div>
              );
            }

            if (el.type === "radio") {
              return (
                <div key={el.id} className="space-y-2" style={elementWrapperStyle(el.elementStyle)}>
                  <span className="block text-sm font-medium" style={labelStyle(el)}>
                    {el.fieldLabel || "Select an option"}
                  </span>
                  <div className="space-y-1.5 pt-0.5">
                    {choices.map((choice) => (
                      <label
                        key={choice}
                        className="flex items-center gap-2.5 rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink cursor-pointer hover:border-ink transition-colors"
                        style={inputStyles(design, el.elementStyle)}
                      >
                        <input
                          type="radio"
                          name={key}
                          value={choice}
                          required={el.fieldRequired}
                          checked={val === choice}
                          onChange={() => setValue(key, choice)}
                          className="accent-ink"
                        />
                        <span>{choice}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            }

            if (el.type === "multiselect") {
              const selectedList = val ? val.split(",").map((s) => s.trim()).filter(Boolean) : [];
              return (
                <div key={el.id} className="space-y-2" style={elementWrapperStyle(el.elementStyle)}>
                  <span className="block text-sm font-medium" style={labelStyle(el)}>
                    {el.fieldLabel || "Select choices"}
                  </span>
                  <div className="space-y-1.5 pt-0.5">
                    {choices.map((choice) => {
                      const isChecked = selectedList.includes(choice);
                      return (
                        <label
                          key={choice}
                          className="flex items-center gap-2.5 rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink cursor-pointer hover:border-ink transition-colors"
                          style={inputStyles(design, el.elementStyle)}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...selectedList, choice]
                                : selectedList.filter((c) => c !== choice);
                              setValue(key, next.join(", "));
                            }}
                            className="h-4 w-4 rounded border-line accent-ink"
                          />
                          <span>{choice}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return (
              <div key={el.id} style={elementWrapperStyle(el.elementStyle)}>
                {el.type !== "checkbox" && (
                  <label className="text-sm font-medium" style={labelStyle(el)} htmlFor={inputId}>
                    {el.fieldLabel}
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
                    style={inputStyles(design, el.elementStyle)}
                  />
                ) : el.type === "select" ? (
                  <select
                    id={inputId}
                    required={el.fieldRequired}
                    value={val}
                    onChange={(e) => setValue(key, e.target.value)}
                    className={baseInputClass}
                    style={inputStyles(design, el.elementStyle)}
                  >
                    <option value="">Choose…</option>
                    {choices.map((o) => (
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
                      className="h-4 w-4 rounded border-line accent-ink"
                    />
                    {el.fieldLabel}
                  </label>
                ) : (
                  <input
                    id={inputId}
                    type={
                      el.type === "email"
                        ? "email"
                        : el.type === "number"
                          ? "number"
                          : el.type === "date"
                            ? "date"
                            : "text"
                    }
                    required={el.fieldRequired}
                    placeholder={el.fieldPlaceholder}
                    value={val}
                    onChange={(e) => setValue(key, e.target.value)}
                    className={baseInputClass}
                    style={inputStyles(design, el.elementStyle)}
                  />
                )}
              </div>
            );
          })}

          {status === "error" && <p className="text-sm text-red-600">{error}</p>}
          {/* Rendered for every form, verification on or off. The server
              requires a Turnstile token on the first request of BOTH flows
              -- the direct submit and the "send me a code" step -- so
              hiding the widget on verification forms (which is what this
              did) meant that request was always rejected with "Missing
              verification token" and no code was ever sent. */}
          <Turnstile key={turnstileNonce} onToken={handleToken} />

          {/* Fallback button if canvas has no button element */}
          {!form.elements!.some((e) => e.type === "button") && (
            <button
              type="submit"
              disabled={status === "submitting" || !turnstileToken}
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
                        {parseChoices(f.options).map((o) => (
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
                          className="h-4 w-4 accent-ink"
                        />
                        {f.label}
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
            <Turnstile key={turnstileNonce} onToken={handleToken} />
            <button
              type="submit"
              disabled={status === "submitting" || !turnstileToken}
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
