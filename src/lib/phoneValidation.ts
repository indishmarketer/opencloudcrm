/**
 * Country-specific phone validation rules and formatters.
 * Ensures visitors enter the exact expected national digits for their selected country.
 */

export type CountryPhoneSpec = {
  name: string;
  dialCode: string;
  exactDigits?: number;
  minDigits?: number;
  maxDigits?: number;
  example: string;
  placeholder: string;
  /** Strip leading 0 common in domestic dialing (e.g. UK 07xxx -> 7xxx) */
  stripLeadingZero?: boolean;
};

export const COUNTRY_PHONE_SPECS: Record<string, CountryPhoneSpec> = {
  IN: { name: "India", dialCode: "91", exactDigits: 10, example: "98765 43210", placeholder: "10-digit mobile number", stripLeadingZero: true },
  US: { name: "United States", dialCode: "1", exactDigits: 10, example: "555 123 4567", placeholder: "10-digit number", stripLeadingZero: false },
  CA: { name: "Canada", dialCode: "1", exactDigits: 10, example: "555 123 4567", placeholder: "10-digit number", stripLeadingZero: false },
  GB: { name: "United Kingdom", dialCode: "44", exactDigits: 10, example: "7911 123456", placeholder: "10-digit mobile (e.g. 7xxx xxxxxx)", stripLeadingZero: true },
  AU: { name: "Australia", dialCode: "61", exactDigits: 9, example: "412 345 678", placeholder: "9-digit mobile (e.g. 4xx xxx xxx)", stripLeadingZero: true },
  TR: { name: "Turkey", dialCode: "90", exactDigits: 10, example: "541 970 7530", placeholder: "10-digit number (e.g. 5xx xxx xxxx)", stripLeadingZero: true },
  RU: { name: "Russia", dialCode: "7", exactDigits: 10, example: "967 056 1548", placeholder: "10-digit number (e.g. 9xx xxx xxxx)", stripLeadingZero: true },
  KZ: { name: "Kazakhstan", dialCode: "7", exactDigits: 10, example: "701 123 4567", placeholder: "10-digit number", stripLeadingZero: true },
  AE: { name: "United Arab Emirates", dialCode: "971", exactDigits: 9, example: "50 123 4567", placeholder: "9-digit number (e.g. 5x xxx xxxx)", stripLeadingZero: true },
  SA: { name: "Saudi Arabia", dialCode: "966", exactDigits: 9, example: "50 123 4567", placeholder: "9-digit number (e.g. 5x xxx xxxx)", stripLeadingZero: true },
  DE: { name: "Germany", dialCode: "49", minDigits: 10, maxDigits: 11, example: "151 12345678", placeholder: "10 to 11 digits", stripLeadingZero: true },
  FR: { name: "France", dialCode: "33", exactDigits: 9, example: "6 12 34 56 78", placeholder: "9-digit mobile (e.g. 6xx xx xx xx)", stripLeadingZero: true },
  IT: { name: "Italy", dialCode: "39", minDigits: 9, maxDigits: 10, example: "320 1234567", placeholder: "9 to 10 digits", stripLeadingZero: false },
  ES: { name: "Spain", dialCode: "34", exactDigits: 9, example: "612 345 678", placeholder: "9-digit number", stripLeadingZero: false },
  NL: { name: "Netherlands", dialCode: "31", exactDigits: 9, example: "6 12345678", placeholder: "9-digit mobile", stripLeadingZero: true },
  BR: { name: "Brazil", dialCode: "55", minDigits: 10, maxDigits: 11, example: "11 98765 4321", placeholder: "10 or 11 digits", stripLeadingZero: true },
  PK: { name: "Pakistan", dialCode: "92", exactDigits: 10, example: "300 1234567", placeholder: "10-digit mobile (e.g. 3xx xxx xxxx)", stripLeadingZero: true },
  BD: { name: "Bangladesh", dialCode: "880", exactDigits: 10, example: "1712 345678", placeholder: "10-digit mobile (e.g. 1xxx xxxxxx)", stripLeadingZero: true },
  NG: { name: "Nigeria", dialCode: "234", exactDigits: 10, example: "803 123 4567", placeholder: "10-digit mobile", stripLeadingZero: true },
  ZA: { name: "South Africa", dialCode: "27", exactDigits: 9, example: "71 123 4567", placeholder: "9-digit mobile (e.g. 7x xxx xxxx)", stripLeadingZero: true },
  SG: { name: "Singapore", dialCode: "65", exactDigits: 8, example: "8123 4567", placeholder: "8-digit number (e.g. 8xxx xxxx / 9xxx xxxx)", stripLeadingZero: false },
  MY: { name: "Malaysia", dialCode: "60", minDigits: 9, maxDigits: 10, example: "12 345 6789", placeholder: "9 to 10 digits", stripLeadingZero: true },
  ID: { name: "Indonesia", dialCode: "62", minDigits: 9, maxDigits: 12, example: "812 3456 7890", placeholder: "9 to 12 digits", stripLeadingZero: true },
  PH: { name: "Philippines", dialCode: "63", exactDigits: 10, example: "917 123 4567", placeholder: "10-digit mobile (e.g. 9xx xxx xxxx)", stripLeadingZero: true },
  VN: { name: "Vietnam", dialCode: "84", exactDigits: 9, example: "91 234 5678", placeholder: "9-digit mobile", stripLeadingZero: true },
  TH: { name: "Thailand", dialCode: "66", exactDigits: 9, example: "81 234 5678", placeholder: "9-digit mobile", stripLeadingZero: true },
  NZ: { name: "New Zealand", dialCode: "64", minDigits: 8, maxDigits: 10, example: "21 123 4567", placeholder: "8 to 10 digits", stripLeadingZero: true },
  IR: { name: "Iran", dialCode: "98", exactDigits: 10, example: "912 123 4567", placeholder: "10-digit mobile", stripLeadingZero: true },
  EG: { name: "Egypt", dialCode: "20", exactDigits: 10, example: "100 123 4567", placeholder: "10-digit mobile", stripLeadingZero: true },
  RO: { name: "Romania", dialCode: "40", exactDigits: 9, example: "748 057 178", placeholder: "9-digit mobile", stripLeadingZero: true },
  CZ: { name: "Czech Republic", dialCode: "420", exactDigits: 9, example: "607 870 479", placeholder: "9-digit number", stripLeadingZero: false },
  XK: { name: "Kosovo", dialCode: "383", exactDigits: 8, example: "49 270 742", placeholder: "8-digit mobile", stripLeadingZero: false },
  TD: { name: "Chad", dialCode: "235", exactDigits: 8, example: "62 383 102", placeholder: "8-digit mobile", stripLeadingZero: false },
  MA: { name: "Morocco", dialCode: "212", exactDigits: 9, example: "625 689 465", placeholder: "9-digit mobile", stripLeadingZero: true },
  KE: { name: "Kenya", dialCode: "254", exactDigits: 9, example: "712 345678", placeholder: "9-digit mobile", stripLeadingZero: true },
  GH: { name: "Ghana", dialCode: "233", exactDigits: 9, example: "24 123 4567", placeholder: "9-digit mobile", stripLeadingZero: true },
};

/**
 * Normalizes a raw input by stripping spaces/dashes and domestic leading 0 if applicable.
 */
export function normalizeNationalDigits(country: string | null | undefined, rawInput: string): string {
  let digits = rawInput.replace(/\D/g, "");
  const spec = country ? COUNTRY_PHONE_SPECS[country.toUpperCase()] : undefined;
  if (spec?.stripLeadingZero && digits.startsWith("0")) {
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
    // validatePhoneNumber(rawInput, optional) or validatePhoneNumber(country, optional)
    rawInput = arg1 || "";
    optional = arg2;
  } else if (typeof arg2 === "string") {
    // Could be (country, rawInput) or (rawInput, country)
    const isFirstCountryCode = arg1 && /^[A-Za-z]{2}$/.test(arg1.trim());
    const isSecondCountryCode = arg2 && /^[A-Za-z]{2}$/.test(arg2.trim());

    if (isFirstCountryCode && !isSecondCountryCode) {
      country = arg1;
      rawInput = arg2;
    } else if (isSecondCountryCode && !isFirstCountryCode) {
      country = arg2;
      rawInput = arg1 || "";
    } else {
      // Default to (country, rawInput)
      country = arg1;
      rawInput = arg2;
    }
    optional = arg3 ?? true;
  } else {
    // Only 1 argument provided: validatePhoneNumber(rawInput)
    rawInput = arg1 || "";
    optional = arg3 ?? true;
  }

  // If rawInput starts with "+", attempt to detect dial code or strip it
  if (rawInput.startsWith("+")) {
    const rawDigits = rawInput.replace(/\D/g, "");
    // If country is not set, try to infer from dial code
    if (!country) {
      for (const [code, spec] of Object.entries(COUNTRY_PHONE_SPECS)) {
        if (rawDigits.startsWith(spec.dialCode)) {
          country = code;
          rawInput = rawDigits.slice(spec.dialCode.length);
          break;
        }
      }
    } else {
      const spec = COUNTRY_PHONE_SPECS[(country || "").toUpperCase()];
      if (spec && rawDigits.startsWith(spec.dialCode)) {
        rawInput = rawDigits.slice(spec.dialCode.length);
      }
    }
  }

  const digits = normalizeNationalDigits(country, rawInput);

  if (!digits) {
    return {
      isValid: optional,
      valid: optional,
      cleanDigits: "",
      e164: null,
      formatted: null,
      error: optional ? undefined : "Please enter your phone number.",
    };
  }

  const upperCountry = (country || "").toUpperCase();
  const spec = COUNTRY_PHONE_SPECS[upperCountry];

  // If country rule is defined:
  if (spec) {
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
        };
      }
    } else {
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
        };
      }
    }

    const dialCode = spec.dialCode;
    const formatted = `+${dialCode}${digits}`;
    return {
      isValid: true,
      valid: true,
      cleanDigits: digits,
      e164: formatted,
      formatted,
      hint: `+${dialCode} ${spec.example}`,
    };
  }

  // Fallback for territories without explicit exact digit rules (ITU standard: 7-15 digits):
  if (digits.length < 7 || digits.length > 15) {
    return {
      isValid: false,
      valid: false,
      cleanDigits: digits,
      e164: null,
      formatted: null,
      error: `Phone number must be between 7 and 15 digits (currently ${digits.length}).`,
    };
  }

  const formatted = `+${digits}`;
  return {
    isValid: true,
    valid: true,
    cleanDigits: digits,
    e164: formatted,
    formatted,
  };
}
