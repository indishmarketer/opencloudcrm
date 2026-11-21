"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import SafeImage from "@/components/SafeImage";
import Turnstile from "@/components/Turnstile";
import EmailInput from "@/components/EmailInput";
import PhoneInput, { toE164, validatePhoneNumber } from "@/components/PhoneInput";
import CountrySelect from "@/components/CountrySelect";
import { detectEmailTypo } from "@/lib/emailValidation";
import { FREE_GUIDE_CONTENT } from "@/lib/freeGuideContent";

type GuideDocumentSummary = {
  id: number;
  title: string;
  fileName: string;
};

/** The free-guide lead magnet popup: a responsive modal (horizontal on desktop
 * with the real guide cover filling the left panel; vertical on mobile).
 * Portaled to document.body so it escapes any ancestor transforms or overflow-hidden.
 *
 * Submitting requests the guide via /api/guide/request, which emails it
 * immediately. There is no verification code and no in-popup download: the
 * only way to the file is the tracked link in that email, which is what
 * proves the address is real. So the success step has one job, which is to
 * get them to go and open their inbox right now.
 */
export default function GuidePopup({
  guideFile,
  buttonLabel,
  buttonClassName,
}: {
  guideFile: GuideDocumentSummary;
  buttonLabel: string;
  buttonClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "sent">("form");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const handleToken = useCallback((t: string) => setTurnstileToken(t), []);

  // Pre-fill email if the visitor is already logged in. CountrySelect owns
  // country detection and always lets the visitor override that guess.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user?.email) {
          setEmail((prev) => prev || d.user.email);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function reset() {
    setStep("form");
    setStatus("idle");
    setError("");
    setPhone("");
    setSubmittedEmail("");
    setTurnstileToken("");
  }

  function handleClose() {
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim() || !name.trim()) return;

    if (phone.trim() && !country) {
      setStatus("error");
      setError("Select your country before entering a phone number.");
      return;
    }
    if (phone.trim()) {
      const phoneVal = validatePhoneNumber(country, phone, true);
      if (!phoneVal.isValid && phoneVal.error) {
        setStatus("error");
        setError(phoneVal.error);
        return;
      }
    }

    // Check for email typo
    const typo = detectEmailTypo(email);
    let finalEmail = email.trim();
    if (typo.hasTypo && typo.suggestedEmail) {
      finalEmail = typo.suggestedEmail;
      setEmail(finalEmail);
    }

    const e164Phone = phone.trim() ? toE164(country, phone) : null;
    setStatus("submitting");
    setError("");

    try {
      const res = await fetch("/api/guide/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guideId: guideFile.id,
          name: name.trim(),
          email: finalEmail,
          phone: e164Phone ?? undefined,
          // Only a country the visitor actually stood behind by typing a
          // number against it. The picker auto-detects, so sending it
          // regardless would record a guess as if they had chosen it, and
          // the server already falls back to the IP country.
          country: e164Phone ? country || undefined : undefined,
          turnstileToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Something went wrong.");
      }
      setSubmittedEmail(finalEmail);
      setStep("sent");
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  const field =
    "w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink-soft outline-none transition-colors focus:border-ink";

  const modalContent = open && (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-line bg-paper text-ink shadow-2xl sm:flex-row sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-paper/90 text-ink-soft shadow-sm transition-colors hover:bg-line hover:text-ink"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Cover panel. The image is the guide's real first page, so it is
            shown edge to edge at its own A4 ratio rather than floated small
            inside a padded box. */}
        {FREE_GUIDE_CONTENT.coverImageUrl && (
          <div className="relative hidden shrink-0 overflow-hidden bg-paper-soft sm:block sm:w-[38%]">
            <SafeImage
              src={FREE_GUIDE_CONTENT.coverImageUrl}
              alt={`${FREE_GUIDE_CONTENT.title} cover`}
              fill
              sizes="(min-width: 640px) 40vw, 100vw"
              className="object-cover object-top"
              priority
            />
          </div>
        )}

        {/* Form and content panel */}
        <div className="flex flex-1 flex-col justify-center overflow-y-auto p-6 sm:p-8">
          {step === "form" && (
            <>
              {/* On phones the full cover would push the form below the fold,
                  so a short strip of it sets the scene instead. */}
              {FREE_GUIDE_CONTENT.coverImageUrl && (
                <div className="relative mb-5 h-28 w-full overflow-hidden rounded-xl border border-line sm:hidden">
                  <SafeImage
                    src={FREE_GUIDE_CONTENT.coverImageUrl}
                    alt=""
                    fill
                    sizes="100vw"
                    className="object-cover object-top"
                    priority
                  />
                </div>
              )}

              <div className="pr-6">
                {/* w-fit matters: this sits inside a flex column, where a
                    bare inline-block still stretches the full width and the
                    pill's outline runs the whole panel. */}
                <span className="inline-flex w-fit self-start rounded-full border border-ink/15 bg-paper-soft px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
                  {FREE_GUIDE_CONTENT.badge}
                </span>
                <h3 className="mt-2.5 font-display text-xl font-semibold leading-snug tracking-tight text-ink sm:text-[1.6rem]">
                  {FREE_GUIDE_CONTENT.headline}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">{FREE_GUIDE_CONTENT.subheadline}</p>
                <ul className="mt-4 space-y-2">
                  {FREE_GUIDE_CONTENT.bullets.map((item) => (
                    <li key={item} className="flex gap-2.5 text-sm leading-snug text-ink-soft">
                      <svg className="mt-0.5 h-4 w-4 shrink-0 text-ink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <form className="mt-6 space-y-3.5" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="guide-name" className="sr-only">
                    Your name
                  </label>
                  <input
                    id="guide-name"
                    name="name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                    className={field}
                  />
                </div>

                <div>
                  <label htmlFor="guide-email" className="sr-only">
                    Email address
                  </label>
                  <EmailInput
                    id="guide-email"
                    name="email"
                    required
                    value={email}
                    onChange={setEmail}
                    placeholder="you@email.com"
                    autoComplete="email"
                    className={field}
                  />
                </div>

                <div>
                  {/* Visible, not sr-only. The field has always been optional
                      (the schema marks it optional and submit only validates
                      a non-empty value), but with the only "optional" wording
                      hidden from sighted users it sat between two required
                      fields and read as required too. */}
                  <label htmlFor="guide-phone" className="mb-1 block text-xs font-medium text-ink-soft">
                    Phone number <span className="font-normal">(optional)</span>
                  </label>
                  {/* One phone row, not a country question followed by a
                      number. The picker shows the calling code and opens a
                      searchable country list, so changing it is the same
                      gesture as on a phone keypad. */}
                  <div className="grid grid-cols-[7.5rem_1fr] gap-2">
                    <CountrySelect
                      id="guide-country"
                      value={country}
                      onChange={(code) => { setCountry(code); setPhone(""); }}
                      autoDetect
                      display="dial"
                    />
                    <PhoneInput id="guide-phone" country={country || "US"} value={phone} onChange={setPhone} showHint={false} />
                  </div>
                </div>

                {status === "error" && (
                  <p className="text-xs font-medium text-red-600">{error}</p>
                )}

                <Turnstile onToken={handleToken} />

                <button
                  type="submit"
                  disabled={status === "submitting" || !turnstileToken}
                  className="w-full rounded-full bg-gradient-to-r from-violet-600 to-purple-700 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition-all hover:from-violet-500 hover:to-purple-600 hover:shadow-xl hover:shadow-violet-600/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  {status === "submitting" ? "Sending your guide…" : "Send me the free guide"}
                </button>
                <p className="text-center text-xs text-ink-soft">
                  I respect your privacy. No spam, and you can unsubscribe any time.
                </p>
              </form>
            </>
          )}

          {step === "sent" && (
            <div className="py-4 text-center sm:py-6 sm:text-left">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="mt-4 font-display text-2xl font-semibold text-ink">
                Your guide is on its way
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                I just sent <strong className="text-ink">{FREE_GUIDE_CONTENT.title}</strong> to{" "}
                <strong className="text-ink">{submittedEmail}</strong>. Open that email and tap the button inside to read it.
              </p>
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-left">
                <p className="text-sm font-semibold text-ink">Go and open it now</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  This is the only copy I send. If it gets buried under everything else in your inbox, you will not get another one, so grab it while you are thinking about it. Check your spam folder if it is not there in a minute.
                </p>
              </div>
              <div className="mt-6 flex justify-center sm:justify-start">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-85"
                >
                  Got it
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className={buttonClassName}
      >
        {buttonLabel}
      </button>

      {open && typeof document !== "undefined" && createPortal(modalContent, document.body)}
    </>
  );
}
