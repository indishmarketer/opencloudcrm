"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import Turnstile from "@/components/Turnstile";
import UpdatesOptIn from "@/components/UpdatesOptIn";
import CountrySelect from "@/components/CountrySelect";
import PhoneInput, { toE164 } from "@/components/PhoneInput";
import { isPhoneRequired } from "@/lib/phoneRequirement";
import { trackEvent } from "@/lib/gtag";

export default function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const searchParams = useSearchParams();
  const interest = searchParams.get("interest") || undefined;
  const ref = searchParams.get("ref") || searchParams.get("invite") || undefined;
  const redirect = searchParams.get("redirect") || "/account";

  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "check-email">("idle");
  const [error, setError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [lastEmail, setLastEmail] = useState("");
  const [resent, setResent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [updatesOptIn, setUpdatesOptIn] = useState(true);
  const [whatsappOptIn, setWhatsappOptIn] = useState(true);
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const handleToken = useCallback((t: string) => setTurnstileToken(t), []);
  // WhatsApp-first markets need the number; everywhere else it's optional.
  const phoneNeeded = isPhoneRequired(country);

  async function handleResend() {
    setResent(true);
    await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: lastEmail, redirect }),
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mode === "signup" && !country) {
      setStatus("error");
      setError("Select your country.");
      return;
    }
    const e164Phone = mode === "signup" ? toE164(country, phone) : null;
    if (mode === "signup" && phoneNeeded && !e164Phone) {
      setStatus("error");
      setError("Enter your phone number.");
      return;
    }
    setStatus("submitting");
    setError("");
    setNeedsVerification(false);
    setResent(false);
    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    const name =
      mode === "signup" ? (form.elements.namedItem("name") as HTMLInputElement).value : undefined;
    setLastEmail(email);

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name,
          interested_in: interest,
          turnstileToken,
          redirect,
          ref,
          updates_opt_in: mode === "signup" ? updatesOptIn : undefined,
          // Only a real number can carry consent, so an unticked box and a
          // ticked one with no number both mean no.
          whatsapp_opt_in: mode === "signup" ? whatsappOptIn && !!e164Phone : undefined,
          country: mode === "signup" ? country : undefined,
          phone: e164Phone ?? undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.needsVerification) setNeedsVerification(true);
        throw new Error(body.error || "Something went wrong.");
      }
      if (mode === "signup") {
        trackEvent("sign_up", {
          method: "email_password",
          signup_context: interest
            ? "course_interest"
            : ref || redirect.startsWith("/community")
              ? "community"
              : "direct",
          destination: redirect,
        });
        // Signup never logs the user in directly anymore -- they have to
        // confirm the email we just sent before getting a real session.
        setStatus("check-email");
        return;
      }
      trackEvent("login", { method: "email_password", destination: redirect });
      // A full page load, not router.push: the client-side transition could
      // hang on "Please wait" and kept the header showing "Login" until a
      // manual refresh, even though the session cookie was already set.
      const safe = redirect.startsWith("/") && !redirect.startsWith("//") && !redirect.includes("\\") ? redirect : "/account";
      window.location.replace(new URL(safe, window.location.origin).toString());
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "check-email") {
    return (
      <div className="mt-10 rounded-2xl border border-line bg-paper-soft p-6 text-center">
        <p className="font-medium">Check your email</p>
        <p className="mt-2 text-sm text-ink-soft">
          We sent a confirmation link to <strong>{lastEmail}</strong>. Click it to activate your
          account and continue.
        </p>
        <button
          type="button"
          onClick={handleResend}
          disabled={resent}
          className="mt-4 text-sm font-medium text-ink underline disabled:opacity-50"
        >
          {resent ? "Sent again — check your inbox" : "Didn't get it? Resend"}
        </button>
      </div>
    );
  }

  const ssoParams = new URLSearchParams();
  ssoParams.set("redirect", redirect);
  if (ref) ssoParams.set("ref", ref);
  const ssoQuery = ssoParams.toString();

  return (
    <>
      <div className="mt-10 space-y-3">
        {SSO_PROVIDERS.map(({ provider, label }) => (
          <a
            key={provider}
            href={`/api/auth/oauth/${provider}/start?${ssoQuery}`}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-paper px-6 py-3 text-sm font-medium text-ink transition-opacity hover:opacity-80"
          >
            <ProviderIcon provider={provider} />
            Continue with {label}
          </a>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-3 text-xs text-ink-soft">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <form className="mt-6 space-y-5" onSubmit={handleSubmit} method="POST">
      {mode === "signup" && (
        <div>
          <label className="text-sm font-medium" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="name"
            className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
          />
        </div>
      )}
      <div>
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete={mode === "signup" ? "email" : "username email"}
          className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
        />
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
        />
      </div>
      {mode === "signup" && (
        <div>
          <label className="text-sm font-medium" htmlFor="country">
            Country
          </label>
          {/* No autoDetect: a pre-filled country gets skipped past, and the
              dial code on the phone field below depends on it being right. */}
          <CountrySelect id="country" value={country} onChange={setCountry} autoDetect={false} className="mt-2" />
        </div>
      )}
      {mode === "signup" && (
        <div>
          <label className="text-sm font-medium" htmlFor="phone">
            Phone {!phoneNeeded && <span className="text-ink-soft">(optional)</span>}
          </label>
          <PhoneInput id="phone" country={country} value={phone} onChange={setPhone} className="mt-2" />
          {phoneNeeded && (
            <p className="mt-1.5 text-xs text-ink-soft">We send order and booking updates on WhatsApp.</p>
          )}
        </div>
      )}
      {mode === "signup" && (
        <UpdatesOptIn
          checked={updatesOptIn}
          onChange={setUpdatesOptIn}
          whatsapp={whatsappOptIn}
          onWhatsAppChange={setWhatsappOptIn}
          hasPhone={!!toE164(country, phone)}
        />
      )}
      {error && (
        <div>
          <p className="text-sm text-red-600">{error}</p>
          {needsVerification && (
            <button
              type="button"
              onClick={handleResend}
              disabled={resent}
              className="mt-2 text-sm font-medium text-ink underline disabled:opacity-50"
            >
              {resent ? "Sent — check your inbox" : "Resend confirmation email"}
            </button>
          )}
        </div>
      )}
      <Turnstile onToken={handleToken} />
      <button
        type="submit"
        disabled={status === "submitting" || !turnstileToken}
        className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {status === "submitting"
          ? "Please wait…"
          : mode === "signup"
            ? "Create account"
            : "Log in"}
      </button>
      </form>
    </>
  );
}

const SSO_PROVIDERS = [
  { provider: "google", label: "Google" },
  { provider: "github", label: "GitHub" },
  { provider: "linkedin", label: "LinkedIn" },
] as const;

function ProviderIcon({ provider }: { provider: "google" | "github" | "linkedin" }) {
  if (provider === "google") {
    return (
      <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.6H24v9.1h11.9c-.5 2.8-2.1 5.1-4.4 6.7v5.6h7.1c4.2-3.8 6.5-9.5 6.5-16.8z" />
        <path fill="#34A853" d="M24 46c6 0 11-2 14.6-5.4l-7.1-5.6c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.7-3.9-12.4-9.1H4.3v5.7C7.9 41.1 15.3 46 24 46z" />
        <path fill="#FBBC05" d="M11.6 27.9c-.4-1.3-.7-2.6-.7-4s.2-2.7.7-4v-5.7H4.3C2.8 17.1 2 20.4 2 23.9s.8 6.8 2.3 9.7z" />
        <path fill="#EA4335" d="M24 10.8c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 4.3 30 2 24 2 15.3 2 7.9 6.9 4.3 14.2l7.3 5.7c1.7-5.2 6.6-9.1 12.4-9.1z" />
      </svg>
    );
  }
  if (provider === "github") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.38 7.86 10.9.57.1.78-.25.78-.55v-2.17c-3.2.7-3.87-1.37-3.87-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.47.11-3.07 0 0 .97-.31 3.18 1.18a11.07 11.07 0 015.79 0c2.21-1.5 3.18-1.18 3.18-1.18.63 1.6.23 2.78.11 3.07.74.8 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.08.78 2.17v3.22c0 .3.21.66.79.55A10.52 10.52 0 0023.5 12C23.5 5.73 18.27.5 12 .5z" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#0A66C2" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.03-1.85-3.03-1.85 0-2.14 1.44-2.14 2.94v5.66H9.35V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.38-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 110-4.14 2.07 2.07 0 010 4.14zM3.56 20.45h3.56V9H3.56v11.45z" />
    </svg>
  );
}
