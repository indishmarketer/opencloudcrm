import { normalizeCountry } from "@/lib/countries";

export type SegmentMatch = "all" | "any";
export type SegmentRule = { field: string; operator: string; value: string };
export type SegmentRules = { match: SegmentMatch; rules: SegmentRule[] };

export const SEGMENT_FIELDS = [
  { value: "marketing_status", label: "Marketing status", values: ["subscribed", "pending", "unsubscribed", "unknown"] },
  { value: "has_account", label: "Has an account", values: ["true", "false"] },
  { value: "whatsapp_status", label: "WhatsApp status", values: ["subscribed", "unsubscribed", "unknown"] },
  { value: "has_phone", label: "Has a phone number", values: ["true", "false"] },
  { value: "has_purchase", label: "Has purchased", values: ["true", "false"] },
  { value: "community_member", label: "Active community member", values: ["true", "false"] },
  { value: "tool_submitter", label: "Has submitted a tool", values: ["true", "false"] },
  { value: "author_status", label: "Author application status", values: ["any", "pending", "approved", "rejected"] },
  { value: "course_enrolled", label: "Enrolled in course ID", values: [] },
  { value: "course_tier", label: "Course and tier", values: [] },
  { value: "campaign_opened", label: "Opened campaign", values: [] },
  { value: "campaign_not_opened", label: "Did not open campaign after 48h", values: [] },
  { value: "campaign_clicked", label: "Clicked campaign", values: [] },
  { value: "last_engaged_days", label: "Engaged within days", values: [] },
  { value: "email_opened_days", label: "Opened an email in the last N days", values: [] },
  { value: "email_clicked_days", label: "Clicked an email in the last N days", values: [] },
  { value: "email_not_opened_days", label: "No email opened in the last N days", values: [] },
  { value: "site_active_days", label: "Active on the website in the last N days", values: [] },
  { value: "site_inactive_days", label: "Not active on the website in the last N days", values: [] },
  { value: "never_engaged", label: "Never engaged", values: ["true", "false"] },
  { value: "country", label: "Country", values: [] },
  { value: "source", label: "Acquisition/action source", values: ["account", "newsletter", "contact", "product_lead"] },
] as const;

/** Rules whose value is a number of days (operator "within"). */
export const DAY_FIELDS: readonly string[] = [
  "last_engaged_days", "email_opened_days", "email_clicked_days", "email_not_opened_days",
  "site_active_days", "site_inactive_days",
];

export function parseSegmentRules(value: unknown): SegmentRules {
  if (!value || typeof value !== "object") return { match: "all", rules: [] };
  const raw = value as { match?: unknown; rules?: unknown };
  const match: SegmentMatch = raw.match === "any" ? "any" : "all";
  const rules = Array.isArray(raw.rules)
    ? raw.rules
        .filter((rule): rule is Record<string, unknown> => !!rule && typeof rule === "object")
        .map((rule) => ({
          field: String(rule.field || ""),
          operator: String(rule.operator || "equals"),
          value: String(rule.value ?? ""),
        }))
        .filter((rule) => SEGMENT_FIELDS.some((field) => field.value === rule.field))
        .slice(0, 20)
    : [];
  return { match, rules };
}

const BOOLEAN_VALUES = new Set(["true", "false"]);
const MARKETING_VALUES = new Set(["subscribed", "pending", "unsubscribed", "unknown"]);
const WHATSAPP_VALUES = new Set(["subscribed", "unsubscribed", "unknown"]);
const AUTHOR_VALUES = new Set(["any", "pending", "approved", "rejected"]);
const SOURCE_VALUES = new Set(["account", "newsletter", "contact", "product_lead"]);

export function isValidSegmentRule(rule: SegmentRule): boolean {
  if (rule.operator !== "equals" && rule.operator !== "within") return false;
  if (rule.field === "marketing_status") return rule.operator === "equals" && MARKETING_VALUES.has(rule.value);
  if (rule.field === "whatsapp_status") return rule.operator === "equals" && WHATSAPP_VALUES.has(rule.value);
  if (["has_account", "has_purchase", "community_member", "tool_submitter", "never_engaged", "has_phone"].includes(rule.field)) {
    return rule.operator === "equals" && BOOLEAN_VALUES.has(rule.value);
  }
  if (rule.field === "author_status") return rule.operator === "equals" && AUTHOR_VALUES.has(rule.value);
  if (["course_enrolled", "campaign_opened", "campaign_not_opened", "campaign_clicked"].includes(rule.field)) {
    return rule.operator === "equals" && /^\d+$/.test(rule.value) && Number(rule.value) > 0;
  }
  if (rule.field === "course_tier") {
    const [courseId, tier, ...extra] = rule.value.split(":");
    return rule.operator === "equals" && /^\d+$/.test(courseId) && Number(courseId) > 0 && ["free", "pro"].includes(tier) && extra.length === 0;
  }
  if (DAY_FIELDS.includes(rule.field)) {
    const days = Number(rule.value);
    return rule.operator === "within" && Number.isInteger(days) && days >= 0 && days <= 3650;
  }
  if (rule.field === "source") return rule.operator === "equals" && SOURCE_VALUES.has(rule.value);
  if (rule.field === "country") return rule.operator === "equals" && (rule.value === "unknown" || normalizeCountry(rule.value) === rule.value);
  return false;
}

export function validateSegmentRules(value: unknown): { rules: SegmentRules; error?: string } {
  const rules = parseSegmentRules(value);
  const rawRules = value && typeof value === "object" && Array.isArray((value as { rules?: unknown }).rules)
    ? (value as { rules: unknown[] }).rules
    : [];
  if (rules.rules.length === 0) return { rules, error: "Add at least one rule." };
  if (rawRules.length > 20 || rawRules.length !== rules.rules.length) {
    return { rules, error: "One or more segment rules are not supported." };
  }
  if (!rules.rules.every(isValidSegmentRule)) return { rules, error: "One or more segment rules are invalid." };
  return { rules };
}
