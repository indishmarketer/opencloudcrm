import { pool } from "@/lib/db";
import { DAY_FIELDS, parseSegmentRules } from "@/lib/contactSegmentTypes";
export { parseSegmentRules } from "@/lib/contactSegmentTypes";
export type { SegmentMatch, SegmentRule, SegmentRules } from "@/lib/contactSegmentTypes";

function boolExpression(expression: string, value: string): string {
  return value === "false" ? `NOT (${expression})` : expression;
}

export function buildSegmentPredicate(rulesInput: unknown, parameterOffset = 1): { sql: string; values: unknown[] } {
  const rules = parseSegmentRules(rulesInput);
  const values: unknown[] = [];
  const clauses: string[] = [];
  const param = (value: unknown): string => {
    values.push(value);
    return `$${parameterOffset + values.length - 1}`;
  };

  for (const rule of rules.rules) {
    let clause = "";
    if (rule.field === "marketing_status") clause = `c.marketing_status = ${param(rule.value)}`;
    if (rule.field === "has_account") clause = boolExpression("c.user_id IS NOT NULL", rule.value);
    if (rule.field === "whatsapp_status") clause = `c.whatsapp_status = ${param(rule.value)}`;
    if (rule.field === "has_phone") clause = boolExpression("(c.phone IS NOT NULL AND c.phone <> '')", rule.value);
    if (rule.field === "has_purchase") {
      clause = boolExpression(
        "EXISTS (SELECT 1 FROM payment_claims pc WHERE pc.user_id = c.user_id AND pc.status = 'approved')",
        rule.value,
      );
    }
    if (rule.field === "community_member") {
      clause = boolExpression(
        "EXISTS (SELECT 1 FROM community_memberships cm WHERE cm.user_id = c.user_id AND cm.status = 'active')",
        rule.value,
      );
    }
    if (rule.field === "tool_submitter") {
      clause = boolExpression(
        "EXISTS (SELECT 1 FROM directory_tools dt WHERE dt.submitted_by_user_id = c.user_id)",
        rule.value,
      );
    }
    if (rule.field === "author_status") {
      clause = rule.value === "any"
        ? "EXISTS (SELECT 1 FROM author_applications aa WHERE aa.user_id = c.user_id)"
        : `EXISTS (SELECT 1 FROM author_applications aa WHERE aa.user_id = c.user_id AND aa.status = ${param(rule.value)})`;
    }
    if (rule.field === "course_enrolled") {
      const courseId = Number(rule.value);
      if (Number.isInteger(courseId)) {
        clause = `EXISTS (SELECT 1 FROM course_enrollments ce WHERE ce.user_id = c.user_id AND ce.course_id = ${param(courseId)})`;
      }
    }
    if (rule.field === "course_tier") {
      const [courseRaw, tier] = rule.value.split(":");
      const courseId = Number(courseRaw);
      if (Number.isInteger(courseId) && (tier === "free" || tier === "pro")) {
        clause = `EXISTS (SELECT 1 FROM course_enrollments ce WHERE ce.user_id = c.user_id AND ce.course_id = ${param(courseId)} AND ce.tier = ${param(tier)})`;
      }
    }
    if (rule.field === "campaign_opened" || rule.field === "campaign_clicked" || rule.field === "campaign_not_opened") {
      const campaignId = Number(rule.value);
      if (Number.isInteger(campaignId)) {
        const campaignParam = param(campaignId);
        const eventColumn = rule.field === "campaign_clicked" ? "first_clicked_at" : "first_opened_at";
        if (rule.field === "campaign_not_opened") {
          clause = `EXISTS (SELECT 1 FROM email_deliveries ed WHERE ed.contact_id = c.id AND ed.campaign_id = ${campaignParam} AND ed.status IN ('sent','delivered') AND ed.created_at < now() - interval '48 hours') AND NOT EXISTS (SELECT 1 FROM email_deliveries ed WHERE ed.contact_id = c.id AND ed.campaign_id = ${campaignParam} AND (ed.first_opened_at IS NOT NULL OR ed.first_clicked_at IS NOT NULL))`;
        } else {
          clause = `EXISTS (SELECT 1 FROM email_deliveries ed WHERE ed.contact_id = c.id AND ed.campaign_id = ${campaignParam} AND ed.${eventColumn} IS NOT NULL)`;
        }
      }
    }
    if (rule.field === "last_engaged_days") {
      const days = Number(rule.value);
      if (Number.isInteger(days) && days >= 0 && days <= 3650) {
        clause = `c.last_engaged_at >= now() - (${param(days)} || ' days')::interval`;
      }
    }
    if (DAY_FIELDS.includes(rule.field) && rule.field !== "last_engaged_days") {
      const days = Number(rule.value);
      if (Number.isInteger(days) && days >= 0 && days <= 3650) {
        const since = `now() - (${param(days)} || ' days')::interval`;
        const opened = `EXISTS (SELECT 1 FROM email_deliveries ed WHERE ed.contact_id = c.id AND NOT ed.is_test AND (ed.last_opened_at >= ${since} OR ed.last_clicked_at >= ${since}))`;
        const siteActive = `(c.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM users su WHERE su.id = c.user_id AND su.last_seen_at >= ${since}))`;
        if (rule.field === "email_opened_days") clause = opened;
        if (rule.field === "email_clicked_days") {
          clause = `EXISTS (SELECT 1 FROM email_deliveries ed WHERE ed.contact_id = c.id AND NOT ed.is_test AND ed.last_clicked_at >= ${since})`;
        }
        if (rule.field === "email_not_opened_days") clause = `NOT ${opened}`;
        if (rule.field === "site_active_days") clause = siteActive;
        if (rule.field === "site_inactive_days") clause = `NOT ${siteActive}`;
      }
    }
    if (rule.field === "country") clause = rule.value === "unknown" ? "c.country IS NULL" : `c.country = ${param(rule.value)}`;
    if (rule.field === "never_engaged") clause = boolExpression("c.last_engaged_at IS NULL", rule.value);
    if (rule.field === "source") {
      const sourceClauses: Record<string, string> = {
        account: "c.user_id IS NOT NULL",
        newsletter: "EXISTS (SELECT 1 FROM newsletter_subscribers ns WHERE lower(trim(ns.email)) = c.normalized_email)",
        contact: "EXISTS (SELECT 1 FROM contact_submissions cs WHERE lower(trim(cs.email)) = c.normalized_email)",
        product_lead: "EXISTS (SELECT 1 FROM product_leads pl WHERE pl.user_id = c.user_id)",
        voice_lead: "EXISTS (SELECT 1 FROM voice_leads vl WHERE lower(trim(vl.email)) = c.normalized_email OR vl.user_id = c.user_id)",
      };
      clause = sourceClauses[rule.value] || "";
    }
    if (clause) clauses.push(clause);
  }

  if (clauses.length === 0) return { sql: "TRUE", values };
  return { sql: `(${clauses.join(rules.match === "any" ? " OR " : " AND ")})`, values };
}

export async function getSegmentById(segmentId: number) {
  const result = await pool.query("SELECT id, name, description, rules, is_system FROM contact_segments WHERE id = $1", [segmentId]);
  return result.rows[0] || null;
}

export async function countSegmentContacts(rules: unknown, marketableOnly = false): Promise<number> {
  const predicate = buildSegmentPredicate(rules);
  const exclusions = marketableOnly
    ? "AND c.marketing_status = 'subscribed' AND c.deliverability_status = 'ok' AND NOT EXISTS (SELECT 1 FROM email_suppressions es WHERE lower(trim(es.email)) = c.normalized_email)"
    : "";
  const result = await pool.query(
    `SELECT count(*)::int AS count FROM contacts c WHERE ${predicate.sql} ${exclusions}`,
    predicate.values,
  );
  return result.rows[0]?.count || 0;
}
