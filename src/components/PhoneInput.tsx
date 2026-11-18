"use client";

import { useMemo } from "react";
import { dialCode } from "@/lib/dialCodes";
import { getCountryFlag } from "@/lib/countryDialCodes";
import {
  COUNTRY_PHONE_SPECS,
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
};

/**
 * Country-aware phone input with national digit validation and auto-formatting.
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
}: PhoneInputProps) {
  const upperCountry = (country || "").toUpperCase();
  const code = dialCode(upperCountry);
  const flag = getCountryFlag(upperCountry);
  const spec = COUNTRY_PHONE_SPECS[upperCountry];

  const digits = useMemo(() => normalizeNationalDigits(upperCountry, value), [upperCountry, value]);
  const validation = useMemo(
    () => validatePhoneNumber(upperCountry, digits, !required),
    [upperCountry, digits, required]
  );

  // Notify parent component if callback provided
  useMemo(() => {
    onValidationChange?.(validation.isValid);
  }, [validation.isValid, onValidationChange]);

  const defaultPlaceholder = spec ? spec.placeholder : placeholder || "Phone number";

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^\d\s-]/g, "");
    onChange(raw);
  }

  const expectedCount = spec?.exactDigits;

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-stretch gap-2">
        {code ? (
          <span className="flex items-center gap-1.5 rounded-xl border border-line bg-paper-soft px-3 py-2 text-sm font-medium text-ink">
            <span>{flag}</span>
            <span>+{code}</span>
          </span>
        ) : (
          <span className="flex items-center rounded-xl border border-line bg-paper-soft px-3 py-2 text-sm text-ink-soft">
            🌐
          </span>
        )}

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
                : "border-line focus:border-ink"
            }`}
          />

          {/* Real-time digit counter badge when typing */}
          {digits.length > 0 && expectedCount && (
            <span
              className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                digits.length === expectedCount
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-paper-soft text-ink-soft border border-line"
              }`}
            >
              {digits.length}/{expectedCount}
            </span>
          )}
        </div>
      </div>

      {/* Helpful validation error or format example */}
      {digits.length > 0 && !validation.isValid && validation.error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {validation.error} {spec?.example && <span>(e.g. {spec.example})</span>}
        </p>
      )}
    </div>
  );
}

/**
 * Combines country code with national number into an international E.164 string (e.g. +919876543210).
 * Returns null if empty.
 */
export function toE164(country: string, nationalNumber: string): string | null {
  const digits = normalizeNationalDigits(country, nationalNumber);
  if (!digits) return null;
  const code = dialCode(country);
  return code ? `+${code}${digits}` : `+${digits}`;
}

export { validatePhoneNumber } from "@/lib/phoneValidation";
