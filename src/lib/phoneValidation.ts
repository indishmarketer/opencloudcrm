/**
 * Country-specific phone validation rules, length groups, and formatters.
 * Groups countries into exact expected national digit lengths (10-digit, 9-digit, 8-digit, 11-digit)
 * so visitors always see exact guidance (e.g. "Enter 10-digit number after +91").
 */

import { countryName } from "@/lib/countries";
import { COUNTRY_DIAL_CODES } from "@/lib/countryDialCodes";
import { DIAL_CODES } from "@/lib/dialCodes";

export type CountryPhoneSpec = {
  code: string;
  name: string;
  dialCode: string;
  exactDigits?: number;
  minDigits?: number;
  maxDigits?: number;
  example: string;
  placeholder: string;
  suggestion: string;
  stripLeadingZero?: boolean;
};

// ── 10-DIGIT COUNTRIES ────────────────────────────────────────────────────────
export const COUNTRIES_10_DIGITS = new Set([
  // South Asia
  "IN", "PK", "BD",
  // North America & NANP (+1)
  "US", "CA", "PR", "GU", "VI", "MP", "AS", "AG", "AI", "BB", "BM", "BS", "DM",
  "DO", "GD", "JM", "KN", "KY", "LC", "MS", "TC", "TT", "VC", "VG",
  // Europe
  "GB", "TR", "RU", "KZ", "UA", "BY", "RS", "BA", "ME", "MK", "AM", "AZ", "GE",
  // Middle East
  "EG", "IR", "IQ",
  // Africa
  "NG", "TZ", "UG", "ET", "DZ", "SD", "CM", "CI",
  // Latin America & Caribbean
  "MX", "CO", "AR", "VE", "EC",
  // East & Southeast Asia
  "PH", "LK", "UZ", "TJ", "KG",
]);

// ── 9-DIGIT COUNTRIES ─────────────────────────────────────────────────────────
export const COUNTRIES_9_DIGITS = new Set([
  // Oceania
  "AU", "NZ",
  // Middle East
  "AE", "SA", "IL", "JO", "LB", "SY", "YE",
  // Western & Southern Europe
  "FR", "ES", "PT", "NL", "BE", "CH", "AT", "GR", "IE", "LU",
  // Central & Eastern Europe
  "RO", "CZ", "PL", "SK", "HU", "BG", "HR", "SI", "LT", "LV",
  // Nordics
  "SE", "FI",
  // Africa
  "ZA", "KE", "GH", "MA", "TN", "SN", "RW", "ZW", "ZM", "MZ", "AO",
  // South America
  "PE", "CL", "BO", "PY", "UY",
  // Asia
  "VN", "TH", "TW", "NP", "MM", "KH",
]);

// ── 8-DIGIT COUNTRIES ─────────────────────────────────────────────────────────
export const COUNTRIES_8_DIGITS = new Set([
  // Asia
  "SG", "HK", "MO",
  // Middle East
  "KW", "QA", "BH", "OM",
  // Europe
  "DK", "NO", "EE", "IS", "CY", "MT", "XK", "AL", "MD", "MC", "LI", "SM",
  // Americas
  "CR", "SV", "HN", "NI", "PA", "GT",
  // Africa
  "TD", "NE", "ML", "BF", "BJ", "TG", "GA", "CG", "MU", "BW", "NA",
]);

// ── 11-DIGIT COUNTRIES ────────────────────────────────────────────────────────
export const COUNTRIES_11_DIGITS = new Set([
  "CN",
]);

// ── RANGE COUNTRIES (10-11 or 9-10 digits) ───────────────────────────────────
export const COUNTRIES_RANGE: Record<string, { min: number; max: number; stripZero?: boolean; example?: string }> = {
  BR: { min: 10, max: 11, stripZero: true, example: "11 98765 4321" },
  DE: { min: 10, max: 11, stripZero: true, example: "151 12345678" },
  JP: { min: 10, max: 11, stripZero: true, example: "90 1234 5678" },
  KR: { min: 10, max: 11, stripZero: true, example: "10 1234 5678" },
  IT: { min: 9, max: 10, stripZero: false, example: "320 1234567" },
  MY: { min: 9, max: 10, stripZero: true, example: "12 345 6789" },
  ID: { min: 9, max: 12, stripZero: true, example: "812 3456 7890" },
};

const SPECIFIC_EXAMPLES: Record<string, string> = {
  IN: "98765 43210",
  US: "555 123 4567",
  CA: "555 123 4567",
  GB: "7911 123456",
  TR: "541 970 7530",
  RU: "967 056 1548",
  AE: "50 123 4567",
  SA: "50 123 4567",
  FR: "6 12 34 56 78",
  ES: "612 345 678",
  AU: "412 345 678",
  ZA: "71 123 4567",
  SG: "8123 4567",
  HK: "9123 4567",
  CN: "138 0013 8000",
  PK: "300 1234567",
  BD: "1712 345678",
  RO: "748 057 178",
  CZ: "607 870 479",
};

/**
 * Returns complete telephone specifications for any ISO-2 country code.
 */
export function getCountryPhoneSpec(countryCode: string | null | undefined): CountryPhoneSpec {
  const code = (countryCode || "IN").trim().toUpperCase();
  const rawDial = DIAL_CODES[code] || COUNTRY_DIAL_CODES[code]?.replace("+", "") || "1";
  const name = countryName(code) || code;
  const example = SPECIFIC_EXAMPLES[code] || "";

  // Check Range countries first
  if (COUNTRIES_RANGE[code]) {
    const range = COUNTRIES_RANGE[code];
    return {
      code,
      name,
      dialCode: rawDial,
      minDigits: range.min,
      maxDigits: range.max,
      example: example || range.example || `${range.min}-${range.max} digits`,
      placeholder: `Enter ${range.min} to ${range.max} digits`,
      suggestion: `Enter your ${range.min} to ${range.max}-digit number after +${rawDial}`,
      stripLeadingZero: range.stripZero ?? true,
    };
  }

  // Check 10-digit group
  if (COUNTRIES_10_DIGITS.has(code)) {
    return {
      code,
      name,
      dialCode: rawDial,
      exactDigits: 10,
      example: example || "98765 43210",
      placeholder: code === "IN" ? "10-digit mobile number" : "Enter 10-digit number",
      suggestion: `Enter your 10-digit number after +${rawDial}`,
      stripLeadingZero: ["GB", "TR", "RU", "IN", "PK", "BD", "EG", "NG"].includes(code),
    };
  }

  // Check 9-digit group
  if (COUNTRIES_9_DIGITS.has(code)) {
    return {
      code,
      name,
      dialCode: rawDial,
      exactDigits: 9,
      example: example || "50 123 4567",
      placeholder: "Enter 9-digit number",
      suggestion: `Enter your 9-digit number after +${rawDial}`,
      stripLeadingZero: ["FR", "AU", "ZA", "AE", "SA", "KE", "MA", "RO"].includes(code),
    };
  }

  // Check 8-digit group
  if (COUNTRIES_8_DIGITS.has(code)) {
    return {
      code,
      name,
      dialCode: rawDial,
      exactDigits: 8,
      example: example || "8123 4567",
      placeholder: "Enter 8-digit number",
      suggestion: `Enter your 8-digit number after +${rawDial}`,
      stripLeadingZero: false,
    };
  }

  // Check 11-digit group
  if (COUNTRIES_11_DIGITS.has(code)) {
    return {
      code,
      name,
      dialCode: rawDial,
      exactDigits: 11,
      example: example || "138 0013 8000",
      placeholder: "Enter 11-digit number",
      suggestion: `Enter your 11-digit number after +${rawDial}`,
      stripLeadingZero: true,
    };
  }

  // Universal Fallback (standard international format)
  return {
    code,
    name,
    dialCode: rawDial,
    minDigits: 7,
    maxDigits: 15,
    example: example || "Phone number",
    placeholder: "Enter phone number",
    suggestion: `Enter your phone number after +${rawDial}`,
    stripLeadingZero: true,
  };
}

/** Legacy lookup export for backwards compatibility */
export const COUNTRY_PHONE_SPECS: Record<string, CountryPhoneSpec> = new Proxy(
  {},
  {
    get: (_target, prop: string) => {
      if (typeof prop !== "string" || prop.length !== 2) return undefined;
      return getCountryPhoneSpec(prop);
    },
  }
);

/**
 * Normalizes a raw input by stripping spaces/dashes and domestic leading 0 if applicable.
 */
export function normalizeNationalDigits(country: string | null | undefined, rawInput: string): string {
  let digits = (rawInput || "").replace(/\D/g, "");
  const spec = getCountryPhoneSpec(country);
  if (spec.stripLeadingZero && digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "");
  }
  return digits;
}

export type PhoneValidationResult = {
  isValid: boolean;
  valid: boolean;
  cleanDigits: string;
  e164: string | null;
  formatted: string | null;
  error?: string;
  hint?: string;
  suggestion?: string;
  expectedDigits?: number;
};

/**
 * Validates a national phone number against the country's rules.
 * Supports both signatures:
 *   validatePhoneNumber(country, rawInput, optional)
 *   validatePhoneNumber(rawInput, country, optional)
 */
export function validatePhoneNumber(
  arg1: string | null | undefined,
  arg2?: string | boolean | null,
  arg3 = true
): PhoneValidationResult {
  let country: string | null | undefined = null;
  let rawInput = "";
  let optional = true;

  if (typeof arg2 === "boolean") {
    rawInput = arg1 || "";
    optional = arg2;
  } else if (typeof arg2 === "string") {
    const isFirstCountryCode = arg1 && /^[A-Za-z]{2}$/.test(arg1.trim());
    const isSecondCountryCode = arg2 && /^[A-Za-z]{2}$/.test(arg2.trim());

    if (isFirstCountryCode && !isSecondCountryCode) {
      country = arg1;
      rawInput = arg2;
    } else if (isSecondCountryCode && !isFirstCountryCode) {
      country = arg2;
      rawInput = arg1 || "";
    } else {
      country = arg1;
      rawInput = arg2;
    }
    optional = arg3 ?? true;
  } else {
    rawInput = arg1 || "";
    optional = arg3 ?? true;
  }

  // If rawInput starts with "+", attempt to detect dial code or strip it
  if (rawInput.startsWith("+")) {
    const rawDigits = rawInput.replace(/\D/g, "");
    if (!country) {
      for (const [code, prefix] of Object.entries(DIAL_CODES)) {
        if (rawDigits.startsWith(prefix)) {
          country = code;
          rawInput = rawDigits.slice(prefix.length);
          break;
        }
      }
    } else {
      const spec = getCountryPhoneSpec(country);
      if (rawDigits.startsWith(spec.dialCode)) {
        rawInput = rawDigits.slice(spec.dialCode.length);
      }
    }
  }

  const spec = getCountryPhoneSpec(country);
  const digits = normalizeNationalDigits(country, rawInput);

  if (!digits) {
    return {
      isValid: optional,
      valid: optional,
      cleanDigits: "",
      e164: null,
      formatted: null,
      error: optional ? undefined : "Please enter your phone number.",
      suggestion: spec.suggestion,
      expectedDigits: spec.exactDigits,
    };
  }

  // Exact digits rule:
  if (spec.exactDigits !== undefined) {
    if (digits.length !== spec.exactDigits) {
      return {
        isValid: false,
        valid: false,
        cleanDigits: digits,
        e164: null,
        formatted: null,
        error: `${spec.name} phone numbers must be exactly ${spec.exactDigits} digits (currently ${digits.length}).`,
        hint: `Example: ${spec.example}`,
        suggestion: spec.suggestion,
        expectedDigits: spec.exactDigits,
      };
    }

    const formatted = `+${spec.dialCode}${digits}`;
    return {
      isValid: true,
      valid: true,
      cleanDigits: digits,
      e164: formatted,
      formatted,
      hint: `+${spec.dialCode} ${spec.example}`,
      suggestion: spec.suggestion,
      expectedDigits: spec.exactDigits,
    };
  }

  // Range rule:
  const min = spec.minDigits || 7;
  const max = spec.maxDigits || 15;
  if (digits.length < min || digits.length > max) {
    return {
      isValid: false,
      valid: false,
      cleanDigits: digits,
      e164: null,
      formatted: null,
      error: `${spec.name} phone numbers must be between ${min} and ${max} digits (currently ${digits.length}).`,
      hint: `Example: ${spec.example}`,
      suggestion: spec.suggestion,
    };
  }

  const formatted = `+${spec.dialCode}${digits}`;
  return {
    isValid: true,
    valid: true,
    cleanDigits: digits,
    e164: formatted,
    formatted,
    hint: `+${spec.dialCode} ${spec.example}`,
    suggestion: spec.suggestion,
  };
}
