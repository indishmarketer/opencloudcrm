import {
  getCountryCallingCode,
  getExampleNumber,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
  type CountryCode,
} from "libphonenumber-js/max";
import mobileExamples from "libphonenumber-js/mobile/examples";
import { countryName, normalizeCountry } from "@/lib/countries";

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
};

function countryCode(value: string | null | undefined): CountryCode | null {
  return normalizeCountry(value) as CountryCode | null;
}

function allowedNationalLengths(country: CountryCode): number[] {
  const lengths: number[] = [];
  for (let length = 4; length <= 15; length += 1) {
    if (validatePhoneNumberLength("1".repeat(length), country) === undefined) lengths.push(length);
  }
  return lengths;
}

/** Country metadata, examples and calling codes come from libphonenumber-js,
 * which is generated from Google's libphonenumber numbering-plan data. */
export function getCountryPhoneSpec(input: string | null | undefined): CountryPhoneSpec {
  const code = countryCode(input) || "US";
  const lengths = allowedNationalLengths(code);
  const exampleNumber = getExampleNumber(code, mobileExamples);
  const example = exampleNumber?.formatNational() || "Phone number";
  const minimum = lengths[0];
  const maximum = lengths[lengths.length - 1];
  return {
    code,
    name: countryName(code) || code,
    dialCode: getCountryCallingCode(code),
    exactDigits: lengths.length === 1 ? lengths[0] : undefined,
    minDigits: lengths.length > 1 ? minimum : undefined,
    maxDigits: lengths.length > 1 ? maximum : undefined,
    example,
    placeholder: example,
    suggestion: `Enter a valid ${countryName(code) || code} phone number`,
  };
}

export const COUNTRY_PHONE_SPECS: Record<string, CountryPhoneSpec> = new Proxy(
  {},
  { get: (_target, property: string) => typeof property === "string" ? getCountryPhoneSpec(property) : undefined },
);

export function normalizeNationalDigits(country: string | null | undefined, rawInput: string): string {
  const raw = String(rawInput || "").trim();
  if (!raw) return "";
  const code = countryCode(country);
  const parsed = raw.startsWith("+")
    ? parsePhoneNumberFromString(raw)
    : code
      ? parsePhoneNumberFromString(raw, code)
      : undefined;
  return parsed?.nationalNumber || raw.replace(/\D/g, "");
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

/** Supports both existing call signatures:
 * validatePhoneNumber(country, value, optional) and
 * validatePhoneNumber(value, country, optional). */
export function validatePhoneNumber(
  arg1: string | null | undefined,
  arg2?: string | boolean | null,
  arg3 = true,
): PhoneValidationResult {
  let country: string | null | undefined;
  let rawInput = "";
  let optional = true;

  if (typeof arg2 === "boolean") {
    rawInput = arg1 || "";
    optional = arg2;
  } else if (typeof arg2 === "string") {
    const firstIsCountry = Boolean(arg1 && /^[A-Za-z]{2}$/.test(arg1.trim()));
    const secondIsCountry = /^[A-Za-z]{2}$/.test(arg2.trim());
    if (firstIsCountry && !secondIsCountry) {
      country = arg1;
      rawInput = arg2;
    } else if (secondIsCountry && !firstIsCountry) {
      country = arg2;
      rawInput = arg1 || "";
    } else {
      country = arg1;
      rawInput = arg2;
    }
    optional = arg3;
  } else {
    rawInput = arg1 || "";
    optional = arg3;
  }

  const raw = rawInput.trim();
  const code = countryCode(country);
  const spec = code ? getCountryPhoneSpec(code) : null;
  if (!raw) {
    return {
      isValid: optional,
      valid: optional,
      cleanDigits: "",
      e164: null,
      formatted: null,
      error: optional ? undefined : "Please enter your phone number.",
      suggestion: spec?.suggestion,
      expectedDigits: spec?.exactDigits,
    };
  }
  if (!code && !raw.startsWith("+")) {
    return { isValid: false, valid: false, cleanDigits: raw.replace(/\D/g, ""), e164: null, formatted: null, error: "Select your country first." };
  }

  const parsed = raw.startsWith("+")
    ? parsePhoneNumberFromString(raw)
    : code
      ? parsePhoneNumberFromString(raw, code)
      : undefined;
  const cleanDigits = parsed?.nationalNumber || raw.replace(/\D/g, "");
  const selectedName = spec?.name || (parsed?.country ? countryName(parsed.country) : "That country");
  if (!parsed || (code && parsed.country && parsed.country !== code)) {
    return { isValid: false, valid: false, cleanDigits, e164: null, formatted: null, error: `Enter a valid ${selectedName} phone number.`, suggestion: spec?.suggestion, expectedDigits: spec?.exactDigits };
  }

  if (!parsed.isPossible()) {
    const expected = spec?.exactDigits
      ? `${spec.exactDigits} digits`
      : spec?.minDigits && spec.maxDigits
        ? `${spec.minDigits} to ${spec.maxDigits} digits`
        : "the correct number of digits";
    return { isValid: false, valid: false, cleanDigits, e164: null, formatted: null, error: `${selectedName} phone numbers require ${expected}.`, hint: spec?.example, suggestion: spec?.suggestion, expectedDigits: spec?.exactDigits };
  }

  if (!parsed.isValid()) {
    return { isValid: false, valid: false, cleanDigits, e164: null, formatted: null, error: `Enter a valid ${selectedName} phone number.`, hint: spec?.example, suggestion: spec?.suggestion, expectedDigits: spec?.exactDigits };
  }

  return {
    isValid: true,
    valid: true,
    cleanDigits,
    e164: parsed.number,
    formatted: parsed.formatInternational(),
    hint: parsed.formatInternational(),
    suggestion: spec?.suggestion,
    expectedDigits: spec?.exactDigits,
  };
}
