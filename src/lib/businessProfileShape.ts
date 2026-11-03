/** The business identity shown on the public site: footer, Contact/About
 * blocks, legal pages, the Organization schema, and email reply-to
 * addresses. Edited from /console/site-settings and stored as one JSON
 * value in site_settings (key BUSINESS_PROFILE_KEY), never in env vars --
 * it's page content, not deployment config, and it differs per country
 * (an Indian sole proprietor has a Udyam number, a US LLC has an EIN or
 * nothing at all), so every field is optional and an empty one is simply
 * not shown anywhere.
 *
 * No imports on purpose: safe to use from client components and plain
 * node tests. The DB read/write lives in src/lib/businessProfile.ts. */

export const BUSINESS_PROFILE_KEY = "business_profile";

export type BusinessAddress = {
  line1: string;
  line2: string;
  city: string;
  region: string;
  state: string;
  postalCode: string;
  country: string;
  countryCode: string;
};

/** Specifics the Terms / Privacy / Refund pages quote directly. Strings so
 * the console form can hold them as typed; resolveLegal() parses them. */
export type BusinessPolicies = {
  refundWindowDays: string;
  refundProcessingDays: string;
  minAge: string;
  /** Courts with authority over disputes. Empty means "the business's own
   * state and country". */
  governingLawJurisdiction: string;
  governingLawCountry: string;
  /** Shown as "Last updated" on every legal page. */
  lastUpdated: string;
};

export type BusinessProfile = {
  /** Legal/trading name. Empty means "use the site name". */
  legalName: string;
  ownerName: string;
  /** e.g. "sole proprietorship", "LLC", "private limited company". */
  entityType: string;
  /** e.g. "Udyam Registration", "EIN", "Company number", "GSTIN". */
  registrationLabel: string;
  registrationNumber: string;
  /** Overrides the generated one-sentence legal line when set. */
  legalLineOverride: string;
  email: string;
  secondaryEmail: string;
  phone: string;
  hours: string;
  address: BusinessAddress;
  /** Footer's short address. Empty means "derive from the full address". */
  addressShort: string;
  /** /author/<slug> page the Organization schema's `founder` links to. */
  founderSlug: string;
  policies: BusinessPolicies;
};

export const EMPTY_BUSINESS_PROFILE: BusinessProfile = {
  legalName: "",
  ownerName: "",
  entityType: "",
  registrationLabel: "",
  registrationNumber: "",
  legalLineOverride: "",
  email: "",
  secondaryEmail: "",
  phone: "",
  hours: "",
  address: { line1: "", line2: "", city: "", region: "", state: "", postalCode: "", country: "", countryCode: "" },
  addressShort: "",
  founderSlug: "",
  policies: {
    refundWindowDays: "7",
    refundProcessingDays: "5-7",
    minAge: "13",
    governingLawJurisdiction: "",
    governingLawCountry: "",
    lastUpdated: "",
  },
};

const FIELD_LIMIT = 300;

function clean(value: unknown, limit = FIELD_LIMIT): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

/** Coerces anything (a stored JSON blob, a PATCH body) into a complete,
 * trimmed profile. Unknown keys are dropped, missing ones become "". */
export function normalizeBusinessProfile(input: unknown): BusinessProfile {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const rawAddress = raw.address && typeof raw.address === "object" ? (raw.address as Record<string, unknown>) : {};
  const rawPolicies = raw.policies && typeof raw.policies === "object" ? (raw.policies as Record<string, unknown>) : {};
  const policy = (key: keyof BusinessPolicies, limit = 120) =>
    rawPolicies[key] === undefined ? EMPTY_BUSINESS_PROFILE.policies[key] : clean(rawPolicies[key], limit);
  return {
    legalName: clean(raw.legalName),
    ownerName: clean(raw.ownerName),
    entityType: clean(raw.entityType),
    registrationLabel: clean(raw.registrationLabel, 80),
    registrationNumber: clean(raw.registrationNumber, 120),
    legalLineOverride: clean(raw.legalLineOverride, 600),
    email: clean(raw.email, 200),
    secondaryEmail: clean(raw.secondaryEmail, 200),
    phone: clean(raw.phone, 60),
    hours: clean(raw.hours, 200),
    address: {
      line1: clean(rawAddress.line1),
      line2: clean(rawAddress.line2),
      city: clean(rawAddress.city, 120),
      region: clean(rawAddress.region, 120),
      state: clean(rawAddress.state, 120),
      postalCode: clean(rawAddress.postalCode, 30),
      country: clean(rawAddress.country, 120),
      countryCode: clean(rawAddress.countryCode, 2).toUpperCase(),
    },
    addressShort: clean(raw.addressShort),
    founderSlug: clean(raw.founderSlug, 120).toLowerCase().replace(/[^a-z0-9-]/g, ""),
    policies: {
      refundWindowDays: policy("refundWindowDays", 10),
      refundProcessingDays: policy("refundProcessingDays", 20),
      minAge: policy("minAge", 3),
      governingLawJurisdiction: policy("governingLawJurisdiction"),
      governingLawCountry: policy("governingLawCountry"),
      lastUpdated: policy("lastUpdated", 60),
    },
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns a human-readable error, or null if the profile can be saved. */
export function validateBusinessProfile(profile: BusinessProfile): string | null {
  if (profile.email && !EMAIL_RE.test(profile.email)) return "The contact email doesn't look like an email address.";
  if (profile.secondaryEmail && !EMAIL_RE.test(profile.secondaryEmail)) {
    return "The secondary email doesn't look like an email address.";
  }
  if (profile.registrationNumber && !profile.registrationLabel) {
    return "Give the registration number a label (for example \"EIN\" or \"Company number\").";
  }
  if (profile.address.countryCode && !/^[A-Z]{2}$/.test(profile.address.countryCode)) {
    return "Country code must be two letters, like US, GB or IN.";
  }
  if (profile.policies.refundWindowDays && !/^\d{1,4}$/.test(profile.policies.refundWindowDays)) {
    return "The refund window must be a whole number of days.";
  }
  if (profile.policies.minAge && !/^\d{1,2}$/.test(profile.policies.minAge)) {
    return "The minimum age must be a whole number.";
  }
  return null;
}

/** A profile with derived display values, so every caller formats the
 * same way. `brand` is the legal name, or the site name when that's blank. */
export type ResolvedBusiness = BusinessProfile & {
  brand: string;
  emails: string[];
  phoneHref: string;
  addressOneLine: string;
  addressShortLine: string;
  legalLine: string;
  legal: ResolvedLegal;
};

export type ResolvedLegal = {
  refundWindowDays: number;
  refundProcessingDays: string;
  minAge: number;
  governingLawJurisdiction: string;
  governingLawCountry: string;
  lastUpdated: string;
};

export function resolveLegal(profile: BusinessProfile): ResolvedLegal {
  const p = profile.policies;
  const country = p.governingLawCountry || profile.address.country;
  return {
    refundWindowDays: Number(p.refundWindowDays) || 7,
    refundProcessingDays: p.refundProcessingDays || "5-7",
    minAge: Number(p.minAge) || 13,
    governingLawJurisdiction: p.governingLawJurisdiction || joinParts([profile.address.state, profile.address.country]) || "the courts where the business is registered",
    governingLawCountry: country || "the country where the business is registered",
    lastUpdated: p.lastUpdated,
  };
}

function joinParts(parts: string[], separator = ", "): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(separator);
}

export function formatAddressOneLine(address: BusinessAddress): string {
  const statePostal = joinParts([address.state, address.postalCode], " - ");
  return joinParts([address.line1, address.line2, address.city, address.region, statePostal, address.country]);
}

/** "a sole proprietorship", "an LLC", "an online store". Acronyms are
 * judged by how their first letter is spoken ("an LLC", "a GmbH"). */
export function withArticle(phrase: string): string {
  const first = phrase.trim().split(/\s+/)[0] || "";
  const isAcronym = first.length > 1 && first === first.toUpperCase() && /[A-Z]/.test(first);
  const vowelSound = isAcronym ? /^[AEFHILMNORSX]/.test(first) : /^[aeiou]/i.test(first);
  return `${vowelSound ? "an" : "a"} ${phrase.trim()}`;
}

export function buildLegalLine(profile: BusinessProfile, brand: string): string {
  if (profile.legalLineOverride) return profile.legalLineOverride;
  if (!profile.ownerName && !profile.entityType && !profile.registrationNumber) return "";
  const entity = profile.entityType ? withArticle(profile.entityType) : "a business";
  const owner = profile.ownerName ? ` owned by ${profile.ownerName}` : "";
  const registration = profile.registrationNumber
    ? ` (${profile.registrationLabel}: ${profile.registrationNumber})`
    : "";
  return `${brand} is ${entity}${owner}${registration}.`;
}

export function resolveBusiness(profile: BusinessProfile, siteName: string): ResolvedBusiness {
  const brand = profile.legalName || siteName;
  const addressOneLine = formatAddressOneLine(profile.address);
  return {
    ...profile,
    brand,
    emails: [profile.email, profile.secondaryEmail].filter(Boolean),
    phoneHref: profile.phone ? `tel:${profile.phone.replace(/[^\d+]/g, "")}` : "",
    addressOneLine,
    addressShortLine:
      profile.addressShort ||
      joinParts([profile.address.line1, profile.address.city, profile.address.postalCode, profile.address.countryCode]),
    legalLine: buildLegalLine(profile, brand),
    legal: resolveLegal(profile),
  };
}

/** Before this lived in the database it was read from BUSINESS_* env vars.
 * A deployment that still has them set (and hasn't saved the profile from
 * the console yet) keeps showing them, so upgrading never blanks a live
 * site's contact details. Saving once from the console moves them into
 * the database; the env vars can then be deleted. */
export function legacyBusinessProfileFromEnv(env: Record<string, string | undefined>): BusinessProfile | null {
  const read = (name: string) => (env[name] || "").trim();
  const names = [
    "BUSINESS_PROPRIETOR", "BUSINESS_EMAIL", "BUSINESS_PHONE", "BUSINESS_ADDRESS_LINE1",
    "BUSINESS_ADDRESS_CITY", "BUSINESS_UDYAM_NUMBER",
  ];
  if (!names.some((name) => read(name))) return null;
  const udyam = read("BUSINESS_UDYAM_NUMBER");
  return normalizeBusinessProfile({
    ownerName: read("BUSINESS_PROPRIETOR"),
    entityType: read("BUSINESS_ENTITY_TYPE"),
    registrationLabel: udyam ? "Udyam Registration" : "",
    registrationNumber: udyam,
    email: read("BUSINESS_EMAIL"),
    secondaryEmail: read("BUSINESS_EMAIL_SECONDARY"),
    phone: read("BUSINESS_PHONE"),
    hours: read("BUSINESS_HOURS"),
    address: {
      line1: read("BUSINESS_ADDRESS_LINE1"),
      line2: read("BUSINESS_ADDRESS_LOCALITY"),
      city: read("BUSINESS_ADDRESS_CITY"),
      region: read("BUSINESS_ADDRESS_DISTRICT"),
      state: read("BUSINESS_ADDRESS_STATE"),
      postalCode: read("BUSINESS_ADDRESS_POSTAL_CODE"),
      country: read("BUSINESS_ADDRESS_COUNTRY"),
      countryCode: read("BUSINESS_ADDRESS_COUNTRY_CODE"),
    },
    addressShort: read("BUSINESS_ADDRESS_SHORT"),
    founderSlug: read("BUSINESS_FOUNDER_SLUG"),
    policies: {
      refundWindowDays: read("LEGAL_REFUND_WINDOW_DAYS") || "7",
      refundProcessingDays: read("LEGAL_REFUND_PROCESSING_DAYS") || "5-7",
      minAge: read("LEGAL_MIN_AGE") || "13",
      governingLawJurisdiction: read("LEGAL_GOVERNING_LAW_JURISDICTION"),
      governingLawCountry: read("LEGAL_GOVERNING_LAW_COUNTRY"),
      lastUpdated: read("LEGAL_LAST_UPDATED"),
    },
  });
}
