"use client";

import { useEffect, useMemo } from "react";
import { getCountryFlag } from "@/lib/countryDialCodes";
import {
  getCountryPhoneSpec,
  normalizeNationalDigits,
  validatePhoneNumber,
} from "@/lib/phoneValidation";

export type PhoneInputProps = {
  country: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  placeholder?: string;
  required?: boolean;
  onValidationChange?: (isValid: boolean) => void;
  showHint?: boolean;
};

/**
 * Country-aware phone input with national digit validation and auto-formatting.
 * Dynamically updates placeholder, calling code, and digit guidance based on country.
 */
export default function PhoneInput({
  country,
  value,
  onChange,
  id = "phone-input",
  className = "",
  placeholder,
  required = false,
  onValidationChange,
  showHint = true,
}: PhoneInputProps) {
  const upperCountry = (country || "IN").toUpperCase();
  const spec = useMemo(() => getCountryPhoneSpec(upperCountry), [upperCountry]);
  const flag = getCountryFlag(upperCountry);
  const code = spec.dialCode;

  const digits = useMemo(() => normalizeNationalDigits(upperCountry, value), [upperCountry, value]);
  const validation = useMemo(
    () => validatePhoneNumber(upperCountry, digits, !required),
    [upperCountry, digits, required]
  );

  // Notify parent component if callback provided
  useEffect(() => {
    onValidationChange?.(validation.isValid);
  }, [validation.isValid, onValidationChange]);

  const defaultPlaceholder = placeholder || spec.placeholder;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^\d\s-]/g, "");
    onChange(raw);
  }

  const expectedCount = spec.exactDigits;
  const isComplete = validation.isValid && digits.length > 0;

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-stretch gap-2">
        <span
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-paper-soft px-3 py-2 text-sm font-medium text-ink select-none"
          title={`${spec.name} (+${code})`}
        >
          <span className="text-base">{flag}</span>
          <span className="font-mono text-xs font-semibold text-ink">+{code}</span>
        </span>

        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={value}
            onChange={handleChange}
            placeholder={defaultPlaceholder}
            className={`w-full rounded-xl border bg-paper px-4 py-3 text-sm outline-none transition ${
              digits.length > 0 && !validation.isValid
                ? "border-amber-400 focus:border-amber-500"
                : isComplete
                  ? "border-emerald-500 focus:border-emerald-600"
                  : "border-line focus:border-ink"
            }`}
          />

          {/* Real-time digit counter badge when typing */}
          {digits.length > 0 && (
            <span
              className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                isComplete
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-paper-soft text-ink-soft border border-line"
              }`}
            >
              {expectedCount
                ? isComplete
                  ? `✓ ${digits.length}/${expectedCount}`
                  : `${digits.length}/${expectedCount}`
                : `${digits.length} digits`}
            </span>
          )}
        </div>
      </div>

      {/* Helpful hint or validation error */}
      {digits.length > 0 && !validation.isValid && validation.error ? (
        <p role="alert" className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
          <span>⚠️</span>
          <span>{validation.error}</span>
        </p>
      ) : showHint ? (
        <p className="mt-1.5 text-[11px] text-ink-soft">
          {spec.suggestion}
          {spec.example ? ` (e.g. ${spec.example})` : ""}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Combines country code with national number into an international E.164 string (e.g. +919876543210).
 * Returns null if empty.
 */
export function toE164(country: string, nationalNumber: string): string | null {
  if (!nationalNumber.trim()) return null;
  return validatePhoneNumber(country, nationalNumber, false).e164;
}

export { validatePhoneNumber, getCountryPhoneSpec } from "@/lib/phoneValidation";
