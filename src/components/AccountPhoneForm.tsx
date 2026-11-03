"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dialCode, stripDialCode } from "@/lib/dialCodes";

export default function AccountPhoneForm({
  initialPhone,
  country,
  verified,
}: {
  initialPhone: string | null;
  country: string | null;
  verified?: boolean;
}) {
  const router = useRouter();
  const currentCode = dialCode(country || "IN") || "91";

  // National digits only (without dial code)
  const initialNational = stripDialCode(country || "IN", initialPhone);
  const [nationalPhone, setNationalPhone] = useState(initialNational);
  const [savedPhone, setSavedPhone] = useState(initialPhone);
  const [isVerified, setIsVerified] = useState(Boolean(verified));
  const [isEditing, setIsEditing] = useState(!initialPhone);

  const [step, setStep] = useState<"edit" | "code">("edit");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Re-syncs the editable nationalPhone field whenever the parent passes
  // down a new initialPhone/country (e.g. after a save) -- setState during
  // render itself, React's documented pattern for "adjust state when a
  // prop changes" (https://react.dev/learn/you-might-not-need-an-effect),
  // rather than a useEffect render-after-render roundtrip.
  const [[prevInitialPhone, prevCountry], setPrevPhoneProps] = useState([initialPhone, country]);
  if (initialPhone && (initialPhone !== prevInitialPhone || country !== prevCountry)) {
    setPrevPhoneProps([initialPhone, country]);
    setNationalPhone(stripDialCode(country || "IN", initialPhone));
  }

  const fullTargetPhone = `${currentCode}${nationalPhone.replace(/\D/g, "")}`;

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    const cleanDigits = nationalPhone.replace(/\D/g, "");
    if (!cleanDigits) {
      setError("Please enter your phone number.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/account/phone/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullTargetPhone }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not send verification code.");
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send verification code.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/account/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "That code did not work.");
      setSavedPhone(body.phone);
      setIsVerified(true);
      setStep("edit");
      setIsEditing(false);
      setCode("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code did not work.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "code") {
    return (
      <form onSubmit={verify} className="space-y-3">
        <p className="text-xs text-ink-soft">
          We sent a verification code to WhatsApp on <strong>{fullTargetPhone}</strong>.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="phone-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            required
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-36 rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
          />
          <button
            type="submit"
            disabled={busy || code.length < 4}
            className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {busy ? "Confirming..." : "Confirm code"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("edit");
              setError("");
            }}
            className="rounded-full border border-line px-4 py-2 text-xs font-medium hover:border-ink hover:bg-paper"
          >
            Change number
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    );
  }

  return (
    <div>
      {!isEditing && savedPhone ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">{savedPhone}</span>
            {isVerified ? (
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                Verified
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                Unverified
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setIsEditing(true);
              setError("");
            }}
            className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink hover:bg-paper"
          >
            Change phone
          </button>
        </div>
      ) : (
        <form onSubmit={sendCode} className="space-y-3">
          {!savedPhone && (
            <p className="text-xs text-ink-soft">No phone number added yet.</p>
          )}
          <div className="flex items-center gap-2">
            <span className="flex h-10 select-none items-center rounded-lg border border-line bg-paper px-3 font-mono text-sm font-medium text-ink">
              {currentCode}
            </span>
            <input
              id="national-phone"
              type="tel"
              inputMode="numeric"
              required
              value={nationalPhone}
              onChange={(e) => setNationalPhone(e.target.value.replace(/\D/g, ""))}
              placeholder="9876543210"
              className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-paper px-4 text-sm outline-none focus:border-ink"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy || !nationalPhone.trim()}
              className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {busy ? "Sending code..." : "Send code on WhatsApp"}
            </button>
            {savedPhone && (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setError("");
                  setNationalPhone(initialNational);
                }}
                className="rounded-full border border-line px-4 py-2 text-xs font-medium hover:border-ink hover:bg-paper"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
