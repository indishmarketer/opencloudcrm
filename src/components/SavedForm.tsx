"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Turnstile from "@/components/Turnstile";
import type { FormCanvasElement, FormDesign, FormField } from "@/lib/formsShape";
import {
  elementButtonStyle,
  elementInputStyle,
  elementTextStyle,
  elementWrapperStyle,
  fieldLayout,
  hasCustomWidth,
  splitBoxStyle,
} from "@/lib/formElementStyles";
import { listCountryDialOptions } from "@/lib/countryDialCodes";
import { isColorDark } from "@/lib/colorValue";

type PublicForm = {
  id: number;
  heading: string;
  introText: string;
  fields: FormField[];
  elements?: FormCanvasElement[];
  submitLabel: string;
  successHeading: string;
  successText: string;
  successImage?: string;
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
/** `designOverride`, when given, forces its buttonColor/buttonTextColor
 * over even a per-element style -- see withOverride's doc comment. */
const buttonStyles = (d: FormDesign, elStyle?: FormCanvasElement["elementStyle"], designOverride?: Partial<FormDesign>) =>
  withOverride(elementButtonStyle(d, elStyle), designOverride, { backgroundColor: "buttonColor", color: "buttonTextColor" });

// `block` keeps an input that has been given an explicit width on its own
// line, under its label, rather than letting it flow inline beside it.
const baseInputClass =
  "form-field-input mt-2 block w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink transition-colors";

/** `designOverride` (a Form element's colour-override fields, set by
 * whatever embeds this form -- a Row column or a Popup, see
 * blockViews.tsx's formDesignOverride) is meant to WIN even over a field
 * or button's own saved per-element style -- that is the whole point of
 * calling it an override rather than a fallback default. Without this, a
 * button (or field) already given an explicit colour once in Console ->
 * Forms stayed exactly that colour everywhere the form was reused, no
 * matter what colour the embedding page or popup asked for -- confirmed
 * live: "I changed the button colour override but the button doesn't
 * change." `design` itself already layers designOverride UNDER the
 * form's own tokens (form.design, then designOverride spread on top), but
 * that still loses to an explicit per-element value upstream in
 * elementButtonStyle/elementInputStyle's own `style?.x || design.x`
 * fallback chain -- this applies the override a second time, after that
 * chain, so it wins regardless. */
type FormDesignColorKey = "backgroundColor" | "textColor" | "placeholderColor" | "borderColor" | "buttonColor" | "buttonTextColor";
function withOverride(
  style: React.CSSProperties,
  override: Partial<FormDesign> | undefined,
  keys: { backgroundColor?: FormDesignColorKey; color?: FormDesignColorKey; borderColor?: FormDesignColorKey; placeholder?: FormDesignColorKey },
): React.CSSProperties {
  if (!override) return style;
  const out = { ...style };
  if (keys.backgroundColor && override[keys.backgroundColor]) out.backgroundColor = override[keys.backgroundColor];
  if (keys.color && override[keys.color]) out.color = override[keys.color];
  if (keys.borderColor && override[keys.borderColor]) out.borderColor = override[keys.borderColor];
  if (keys.placeholder && override[keys.placeholder]) (out as Record<string, string>)["--ph-color"] = override[keys.placeholder] as string;
  return out;
}

/** A field's own label follows its text colour and font size so restyling an
 * element restyles the whole field, not just its input box.
 *
 * It is deliberately always left-aligned. Alignment positions the field's
 * box (and the value inside it); the label stays on the left edge of that
 * box, which is where a form label belongs whether the field is left,
 * centre or right aligned.
 *
 * `display: block` is not cosmetic. A <label> is inline by default, and an
 * input given an explicit width becomes inline-block -- so narrowing a field
 * used to pull its input up onto the same line as its label instead of
 * keeping it underneath. */
function labelStyle(design: FormDesign, el: FormCanvasElement, designOverride?: Partial<FormDesign>): React.CSSProperties {
  const style: React.CSSProperties = {
    display: "block",
    textAlign: "left",
    // labelColor overrides independently of the value typed into the box
    // (textColor) -- the two used to be the same knob, which made a label
    // light enough to read on a dark field also force the typed value's
    // colour. Both fall back to the form's own text colour, same as every
    // other element, so an untouched field still follows a form-wide dark
    // theme instead of staying uncoloured.
    color: el.elementStyle?.labelColor || el.elementStyle?.textColor || design.textColor || undefined,
    fontSize: el.elementStyle?.fontSize || undefined,
    fontWeight: el.elementStyle?.fontWeight || undefined,
  };
  return withOverride(style, designOverride, { color: "textColor" });
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

  // The row is one control made of two pieces: the wrapper carries its width
  // and placement, each piece only its look. Giving both pieces the full
  // style made a 280px field render 560px wide.
  const { box: phoneBox, paint: phonePaint } = splitBoxStyle(style || {});
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
    <div ref={containerRef} className="relative mt-2 flex gap-2" style={phoneBox}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-sm text-ink outline-none transition-colors hover:border-ink focus:border-ink"
        style={phonePaint}
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
        className="form-field-input flex-1 rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none transition-colors focus:border-ink"
        style={phonePaint}
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
  initialForm,
  preview = false,
}: {
  formId: number;
  showHeading?: boolean;
  designOverride?: Partial<FormDesign>;
  /** Drawn inside the page editor, where the form is a picture of itself
   * and never submitted. No bot challenge is loaded.
   *
   * This is not cosmetic. Turnstile renders its own Cloudflare-hosted
   * iframe, and the editor's mobile preview is itself an about:blank
   * iframe -- a challenge nested in there cannot complete, so Cloudflare
   * showed its own "page could not load / reload to try again" screen and
   * took the whole preview down with it. That is why mobile preview failed
   * on exactly the pages that embed a form and nowhere else. */
  preview?: boolean;
  /** The definition, already resolved on the server. Supplied by every
   * server-rendered placement (a page section, the /f/<slug> page), so the
   * form draws with the page instead of showing "Loading…" while the
   * browser fetches what the server already had. */
  initialForm?: PublicForm;
}) {
  const [form, setForm] = useState<PublicForm | null>(initialForm ?? null);
  const [loadError, setLoadError] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  // In a preview there is no challenge to pass, so the submit button must
  // not sit permanently disabled waiting for a token that never arrives.
  const [turnstileToken, setTurnstileToken] = useState(preview ? "preview" : "");
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
  /** The thank-you popup. Closing it leaves the same message in place where
   * the form was, so the confirmation is never lost. */
  const [successOpen, setSuccessOpen] = useState(false);
  /** Set once the visitor actually closes the confirmation -- "I clicked
   * close, it's still showing You're subscribed" was this exact inline
   * fallback below: it rendered unconditionally (so the message was never
   * lost if someone closed the popup by accident), but that reads as the
   * popup not having closed at all. Closing now means closing. */
  const [successDismissed, setSuccessDismissed] = useState(false);
  /** True only between clicking "Send a new code" and the resend going out,
   * which is the one moment the code screen needs a challenge. */
  const [resendArmed, setResendArmed] = useState(false);
  const otpCodeRef = useRef<HTMLInputElement>(null);
  const [selectedPhoneCountry, setSelectedPhoneCountry] = useState<Record<string, string>>({});

  /** The code screen floats as a popup (see the `step === "otp"` render
   * below) -- Escape closes it the same way the X does, back to the form
   * the visitor already filled in rather than a dead end. */
  const closeOtp = useCallback(() => {
    setStep("form");
    setError("");
    setOtpNotice("");
    setStatus("idle");
    setResendArmed(false);
    freshChallenge();
  }, [freshChallenge]);

  useEffect(() => {
    if (step !== "otp") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeOtp();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, closeOtp]);

  useEffect(() => {
    // Already have it from the server: nothing to fetch, nothing to wait for.
    if (initialForm) return;
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
  }, [formId, initialForm]);

  function handleSuccess(currentForm: PublicForm) {
    if (currentForm.submissionAction === "redirect" && currentForm.redirectUrl) {
      window.location.href = currentForm.redirectUrl;
      return;
    }
    setStatus("done");
    setSuccessOpen(true);
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
    if (!form || preview) return;

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

  // Fires the resend as soon as the briefly-mounted challenge hands back a
  // token, so the visitor only ever clicks "Send a new code" once.
  useEffect(() => {
    if (!resendArmed || !turnstileToken || !form) return;
    let cancelled = false;
    void (async () => {
      const sent = await postForm(form);
      if (cancelled) return;
      setResendArmed(false);
      if (sent) setOtpNotice(`A new code is on its way to ${otpEmail}.`);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resendArmed, turnstileToken]);

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
  // Only reachable when no server-rendered definition was supplied -- the
  // page editor's canvas. A skeleton shaped like a form reads as the form
  // arriving, rather than as the page having failed.
  if (!form) {
    return (
      <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading form">
        <div className="h-4 w-1/3 rounded bg-line" />
        <div className="h-11 w-full rounded-lg bg-line/60" />
        <div className="h-4 w-1/4 rounded bg-line" />
        <div className="h-11 w-full rounded-lg bg-line/60" />
        <div className="h-11 w-32 rounded-xl bg-line" />
      </div>
    );
  }

  const design = { ...(form.design || {}), ...designOverride };
  // Turnstile renders its own markup (an iframe plus our "Verifying…" /
  // "Verified" status line), so it can't just inherit `color` from
  // whatever section it sits in the way ordinary text does -- it needs to
  // be told. Prefer the form's own background; when that's left blank
  // (inheriting the page/popup's own background instead), a light text
  // colour is the next-best signal that this form was deliberately styled
  // for a dark surface.
  const formIsDark = design.backgroundColor
    ? isColorDark(design.backgroundColor)
    : design.textColor
      ? !isColorDark(design.textColor)
      : false;

  if (status === "done") {
    const close = () => {
      setSuccessOpen(false);
      setSuccessDismissed(true);
    };
    if (successDismissed) return null;
    // The confirmation is a centred popup over the page rather than text
    // quietly replacing the form in place, so it is impossible to miss --
    // especially for a form sitting low on a long page.
    return (
      <>
        <div style={designStyles(design)} className="text-center">
          <h2 className="font-display text-2xl font-semibold">{form.successHeading || "Thanks, got it."}</h2>
          {form.successText && <p className="mt-3 text-ink-soft">{form.successText}</p>}
        </div>
        {successOpen &&
          createPortal(
            <div
              className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/50 px-6 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`saved-form-${form.id}-success`}
              onClick={close}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={designStyles(design)}
                className="relative w-full max-w-md rounded-2xl border border-line bg-paper p-8 text-center shadow-2xl"
              >
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-paper-soft text-ink-soft transition-colors hover:bg-line hover:text-ink"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>

                {form.successImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.successImage}
                    alt=""
                    className="mx-auto mb-5 max-h-40 w-auto rounded-xl object-contain"
                  />
                )}
                <h2 id={`saved-form-${form.id}-success`} className="font-display text-2xl font-semibold">
                  {form.successHeading || "Thanks, got it."}
                </h2>
                {form.successText && <p className="mt-3 text-ink-soft">{form.successText}</p>}
                <button
                  type="button"
                  onClick={close}
                  className="mt-6 rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80"
                  style={buttonStyles(design, undefined, designOverride)}
                >
                  Close
                </button>
              </div>
            </div>,
            document.body,
          )}
      </>
    );
  }

  if (step === "otp") {
    // A true floating popup, not text quietly replacing the form in place --
    // same reasoning and the same chrome as the `done` step above: a
    // centred bg-paper/text-ink card over the page, so it is always legible
    // regardless of the section it's sitting in (a dark hero, for example),
    // with a close-X that backs out to the form rather than a dead end.
    if (typeof document === "undefined") return null;
    return (
      createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/50 px-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`saved-form-${form.id}-otp`}
          onClick={closeOtp}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={designStyles(design)}
            className="relative w-full max-w-md rounded-2xl border border-line bg-paper p-8 text-ink shadow-2xl"
          >
            <button
              type="button"
              onClick={closeOtp}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-paper-soft text-ink-soft transition-colors hover:bg-line hover:text-ink"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <h2 id={`saved-form-${form.id}-otp`} className="font-display text-2xl font-semibold">
              Check your email
            </h2>
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
                className="form-field-input block w-full rounded-lg border border-line bg-paper px-4 py-3 text-center text-lg tracking-widest text-ink outline-none focus:border-ink"
                style={withOverride(elementInputStyle(design, design.verifyInput), designOverride, {
                  backgroundColor: "backgroundColor",
                  color: "textColor",
                  borderColor: "borderColor",
                  placeholder: "placeholderColor",
                })}
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              {otpNotice && <p className="text-sm text-ink-soft">{otpNotice}</p>}
              <button
                type="submit"
                disabled={status === "submitting"}
                className={`block ${hasCustomWidth(design.verifyButton) ? "" : "w-full"} rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50`}
                style={buttonStyles(design, design.verifyButton, designOverride)}
              >
                {status === "submitting" ? "Verifying…" : "Confirm and submit"}
              </button>
            </form>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
              <button
                type="button"
                disabled={status === "submitting" || resendArmed}
                onClick={() => {
                  setOtpNotice("");
                  setError("");
                  // Resending posts the whole form again, which needs a token
                  // of its own. The challenge is mounted only for that
                  // moment -- the code screen should not sit there showing
                  // "Verified" for something the visitor already passed on
                  // the previous step.
                  setResendArmed(true);
                  freshChallenge();
                }}
                className="underline text-ink-soft hover:text-ink disabled:opacity-50"
              >
                {resendArmed ? "Sending…" : "Send a new code"}
              </button>
              <button type="button" onClick={closeOtp} className="underline text-ink-soft hover:text-ink">
                Change my answers
              </button>
            </div>
            {resendArmed && (
              <div className="mt-3">
                <Turnstile key={turnstileNonce} onToken={handleToken} dark={formIsDark} />
              </div>
            )}
          </div>
        </div>,
        document.body,
      )
    );
  }

  const hasElements = Array.isArray(form.elements) && form.elements.length > 0;
  const setValue = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  // The challenge belongs immediately above the submit button, not after it.
  // It is rendered as part of the first button element so it cannot end up
  // stranded below the button when the button is not the last element.
  const firstButton = form.elements?.find((e) => e.type === "button");
  const firstButtonId = firstButton?.id;
  const challenge = preview ? null : <Turnstile key={turnstileNonce} onToken={handleToken} dark={formIsDark} />;



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
                <Fragment key={el.id}>
                {/* The challenge and the button are one group, positioned by
                    the button's alignment, with both pinned to the group's
                    left edge -- so the challenge starts exactly where the
                    button starts instead of being centred on its own. Same
                    idea as a field's label sitting on its box's left edge. */}
                <div
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
                  <div className={`flex flex-col items-start gap-3 ${fullWidth ? "w-full" : ""}`}>
                    {el.id === firstButtonId && challenge}
                    <button
                      type="submit"
                      disabled={status === "submitting" || !turnstileToken}
                      className={`${fullWidth ? "w-full" : ""} ${
                        el.elementStyle?.paddingX || el.elementStyle?.padding ? "" : "px-6"
                      } ${
                        el.elementStyle?.paddingY || el.elementStyle?.padding || el.elementStyle?.height ? "" : "py-3"
                      } rounded-xl bg-ink text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50`}
                      style={buttonStyles(design, el.elementStyle, designOverride)}
                    >
                      {status === "submitting" ? "Sending…" : el.buttonLabel || "Submit"}
                    </button>
                  </div>
                </div>
                </Fragment>
              );
            }

            // Input fields. The label and the control share one sized box --
            // see fieldLayout -- so the label tracks the field's left edge
            // instead of drifting to the form's edge or centring with it.
            const key = el.fieldKey || el.id;
            const inputId = `saved-form-${form.id}-${key}`;
            const val = values[key] || "";
            const choices = parseChoices(el.fieldOptions);
            const { group: fieldGroup, control: rawFieldControl } = fieldLayout(design, el.elementStyle);
            const fieldControl = withOverride(rawFieldControl, designOverride, {
              backgroundColor: "backgroundColor",
              color: "textColor",
              borderColor: "borderColor",
              placeholder: "placeholderColor",
            });

            if (el.type === "country") {
              return (
                <div key={el.id} style={fieldGroup}>
                  <label className="text-sm font-medium" style={labelStyle(design, el, designOverride)} htmlFor={inputId}>
                    {el.fieldLabel || "Country"}
                  </label>
                  <CountryPicker
                    id={inputId}
                    value={val}
                    onChange={(code) => {
                      setValue(key, code);
                      handleCountrySelect(code);
                    }}
                    style={fieldControl}
                  />
                </div>
              );
            }

            if (el.type === "phone") {
              return (
                <div key={el.id} style={fieldGroup}>
                  <label className="text-sm font-medium" style={labelStyle(design, el, designOverride)} htmlFor={inputId}>
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
                    style={fieldControl}
                  />
                </div>
              );
            }

            if (el.type === "radio") {
              return (
                <div key={el.id} className="space-y-2" style={fieldGroup}>
                  <span className="block text-sm font-medium" style={labelStyle(design, el, designOverride)}>
                    {el.fieldLabel || "Select an option"}
                  </span>
                  <div className="space-y-1.5 pt-0.5">
                    {choices.map((choice) => (
                      <label
                        key={choice}
                        className="flex items-center gap-2.5 rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink cursor-pointer hover:border-ink transition-colors"
                        style={fieldControl}
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
                <div key={el.id} className="space-y-2" style={fieldGroup}>
                  <span className="block text-sm font-medium" style={labelStyle(design, el, designOverride)}>
                    {el.fieldLabel || "Select choices"}
                  </span>
                  <div className="space-y-1.5 pt-0.5">
                    {choices.map((choice) => {
                      const isChecked = selectedList.includes(choice);
                      return (
                        <label
                          key={choice}
                          className="flex items-center gap-2.5 rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink cursor-pointer hover:border-ink transition-colors"
                          style={fieldControl}
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
              <div key={el.id} style={fieldGroup}>
                {el.type !== "checkbox" && (
                  <label className="text-sm font-medium" style={labelStyle(design, el, designOverride)} htmlFor={inputId}>
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
                    style={fieldControl}
                  />
                ) : el.type === "select" ? (
                  <select
                    id={inputId}
                    required={el.fieldRequired}
                    value={val}
                    onChange={(e) => setValue(key, e.target.value)}
                    className={baseInputClass}
                    style={fieldControl}
                  >
                    <option value="">Choose…</option>
                    {choices.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : el.type === "checkbox" ? (
                  <label
                    className="inline-flex items-center gap-2 text-sm font-medium"
                    style={labelStyle(design, el, designOverride)}
                    htmlFor={inputId}
                  >
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
                    autoComplete={
                      el.type === "full_name"
                        ? "name"
                        : el.type === "first_name"
                          ? "given-name"
                          : el.type === "last_name"
                            ? "family-name"
                            : el.type === "email"
                              ? "email"
                              : el.type === "address"
                                ? "street-address"
                                : undefined
                    }
                    required={el.fieldRequired}
                    placeholder={el.fieldPlaceholder}
                    value={val}
                    onChange={(e) => setValue(key, e.target.value)}
                    className={baseInputClass}
                    style={fieldControl}
                  />
                )}
              </div>
            );
          })}

          {status === "error" && <p className="text-sm text-red-600">{error}</p>}

          {/* No button element on the canvas: the challenge and a fallback
              submit button go here instead, still in that order. The
              challenge is rendered for every form, verification on or off --
              the server requires a Turnstile token on the first request of
              BOTH flows, so hiding it on verification forms (which is what
              this used to do) meant the request was always rejected with
              "Missing verification token" and no code was ever sent. */}
          {!firstButtonId && (
            <>
              {challenge}
              <button
                type="submit"
                disabled={status === "submitting" || !turnstileToken}
                className="w-full rounded-xl bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
                style={buttonStyles(design, undefined, designOverride)}
              >
                {status === "submitting" ? "Sending…" : form.submitLabel || "Submit"}
              </button>
            </>
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
            <Turnstile key={turnstileNonce} onToken={handleToken} dark={formIsDark} />
            <button
              type="submit"
              disabled={status === "submitting" || !turnstileToken}
              className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
              style={buttonStyles(design, undefined, designOverride)}
            >
              {status === "submitting" ? "Sending…" : form.submitLabel}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
