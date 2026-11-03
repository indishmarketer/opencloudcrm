"use client";

import { dialCode } from "@/lib/dialCodes";

/** A phone number field prefixed with the calling code for whatever country
 * is currently selected elsewhere in the same form (so the person never
 * types their own country code). `value`/`onChange` carry only the national
 * number (digits, spaces, dashes as typed); combine with `country` via
 * `toE164` before sending to the server. */
export default function PhoneInput({
  country,
  value,
  onChange,
  id,
  className,
  placeholder = "Phone number",
}: {
  country: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  placeholder?: string;
}) {
  const code = dialCode(country);
  return (
    <div className={`flex items-stretch gap-2 ${className || ""}`}>
      {code && (
        <span className="flex items-center rounded-lg border border-line bg-paper-soft px-3 text-sm text-ink-soft">
          +{code}
        </span>
      )}
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d\s-]/g, ""))}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
      />
    </div>
  );
}

/** Combines a chosen country with a typed national number into the digits
 * WhatsApp/Razorpay/PayPal expect (country code + number, no "+", no
 * spaces). Returns null when there's nothing to send. */
export function toE164(country: string, nationalNumber: string): string | null {
  const digits = nationalNumber.replace(/\D/g, "");
  if (!digits) return null;
  const code = dialCode(country);
  return code ? `${code}${digits}` : digits;
}
