export const BUSINESS_CATEGORIES = [
  { value: "agency", label: "Agency" },
  { value: "consulting", label: "Consulting" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "education", label: "Education" },
  { value: "healthcare", label: "Healthcare" },
  { value: "local-business", label: "Local business" },
  { value: "real-estate", label: "Real estate" },
  { value: "saas", label: "SaaS / software" },
  { value: "other", label: "Other" },
] as const;

export const BUSINESS_CATEGORY_VALUES = new Set<string>(
  BUSINESS_CATEGORIES.map(({ value }) => value),
);

export type VoiceAgentBusinessProfile = {
  company: string;
  role: string;
  website: string;
  category: string;
};
