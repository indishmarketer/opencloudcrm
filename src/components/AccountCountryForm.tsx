"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CountrySelect from "@/components/CountrySelect";

/** Lets the signed-in person save their own country. Used in account
 * settings and inside checkout ("Not in India? Change"); after saving, the
 * page re-renders so prices and payment method follow the new country. */
export default function AccountCountryForm({
  initialCountry,
  onSaved,
  saveLabel = "Save",
}: {
  initialCountry: string | null;
  onSaved?: (country: string) => void;
  saveLabel?: string;
}) {
  const router = useRouter();
  const [country, setCountry] = useState(initialCountry || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save() {
    if (!country) {
      setError("Select your country.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/account/country", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save your country.");
      setMessage("Saved.");
      onSaved?.(country);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your country.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <CountrySelect
          value={country}
          onChange={(code) => {
            setCountry(code);
            setMessage("");
          }}
          autoDetect={!initialCountry}
          className="min-w-0 flex-1 sm:max-w-xs"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving || !country || country === initialCountry}
          className="rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-ink hover:bg-paper disabled:opacity-50"
        >
          {saving ? "Saving…" : saveLabel}
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-ink-soft">{message}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
