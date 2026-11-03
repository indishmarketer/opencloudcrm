import { pool } from "@/lib/db";

/** Email analytics for /console/email/analytics. Everything is computed from
 * email_deliveries (one row per email sent) and email_events (opens, clicks,
 * unsubscribes, and the bounce/complaint/delivery events SES sends back).
 * Days are India days. Test sends are always excluded. */

export const TIME_ZONE = "Asia/Kolkata";

export const ANALYTICS_TYPES = [
  { value: "", label: "All email" },
  { value: "campaign", label: "Campaigns" },
  { value: "automation", label: "Automation" },
  { value: "fixed", label: "Transactional" },
] as const;

export const RANGE_PRESETS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "12 months" },
] as const;

export type AnalyticsWindow = {
  range: string;
  /** Inclusive India days, YYYY-MM-DD. */
  from: string;
  to: string;
  type: string;
  days: number;
  prevFrom: string;
  prevTo: string;
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayInIndia(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export function resolveWindow(params: Record<string, string | string[] | undefined>): AnalyticsWindow {
  const pick = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const today = todayInIndia();
  const typeParam = pick("type");
  const type = ANALYTICS_TYPES.some((t) => t.value === typeParam) ? typeParam : "";
  let range = pick("range") || "30";
  let from: string;
  let to = today;

  if (range === "custom" && DAY_RE.test(pick("from")) && DAY_RE.test(pick("to"))) {
    from = pick("from");
    to = pick("to");
    if (from > to) [from, to] = [to, from];
    if (to > today) to = today;
    if (from > today) from = today;
  } else {
    if (!RANGE_PRESETS.some((p) => p.value === range)) range = "30";
    from = shiftDay(today, -(Number(range) - 1));
  }
  const days = dayDiff(from, to) + 1;
  return { range, from, to, type, days, prevFrom: shiftDay(from, -days), prevTo: shiftDay(from, -1) };
}

export type Metrics = {
  sent: number;
  recipients: number;
  delivered: number;
  tracked: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
};

/** Emails SENT in [from, to] and how each of them did since (cohort view, as
 * Mailchimp/HubSpot report it). $1 from day, $2 to day, $3 type ('' = all). */
const COHORT = `
  WITH d AS (
    SELECT ed.*, COALESCE(et.track_opens, true) AS tracked,
      (ed.delivered_at IS NOT NULL OR ed.status = 'delivered') AS is_delivered,
      EXISTS (SELECT 1 FROM email_events e WHERE e.delivery_id = ed.id AND e.event = 'unsubscribed') AS unsubscribed
    FROM email_deliveries ed
    LEFT JOIN email_templates et ON et.key = ed.template_key
    WHERE NOT ed.is_test AND ed.sent_at IS NOT NULL
      AND ed.sent_at >= ($1::date)::timestamp AT TIME ZONE '${TIME_ZONE}'
      AND ed.sent_at < (($2::date) + 1)::timestamp AT TIME ZONE '${TIME_ZONE}'
      AND ($3 = '' OR ed.category = $3)
  )`;

const METRIC_COLUMNS = `
  count(d.id)::int AS sent,
  count(DISTINCT lower(d.recipient_email))::int AS recipients,
  count(d.id) FILTER (WHERE d.is_delivered)::int AS delivered,
  count(d.id) FILTER (WHERE d.tracked AND d.is_delivered)::int AS tracked,
  count(d.id) FILTER (WHERE d.tracked AND d.is_delivered AND (d.first_opened_at IS NOT NULL OR d.first_clicked_at IS NOT NULL))::int AS opened,
  count(d.id) FILTER (WHERE d.first_clicked_at IS NOT NULL)::int AS clicked,
  count(d.id) FILTER (WHERE d.status = 'bounced')::int AS bounced,
  count(d.id) FILTER (WHERE d.status = 'complained')::int AS complained,
  count(d.id) FILTER (WHERE d.unsubscribed)::int AS unsubscribed`;

export async function getMetrics(from: string, to: string, type: string): Promise<Metrics> {
  const result = await pool.query(`${COHORT} SELECT ${METRIC_COLUMNS} FROM d`, [from, to, type]);
  return result.rows[0];
}

export type DailyPoint = { day: string; sent: number; opened: number; clicked: number };

/** What happened each day: emails sent, first opens and first clicks that
 * day (whenever the email was sent). */
export async function getDaily(from: string, to: string, type: string): Promise<DailyPoint[]> {
  const result = await pool.query(
    `WITH days AS (SELECT generate_series($1::date, $2::date, interval '1 day')::date AS day),
     base AS (
       SELECT sent_at, first_opened_at, first_clicked_at FROM email_deliveries
       WHERE NOT is_test AND ($3 = '' OR category = $3)
     )
     SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
       (SELECT count(*) FROM base WHERE (sent_at AT TIME ZONE '${TIME_ZONE}')::date = days.day)::int AS sent,
       (SELECT count(*) FROM base WHERE (COALESCE(first_opened_at, first_clicked_at) AT TIME ZONE '${TIME_ZONE}')::date = days.day)::int AS opened,
       (SELECT count(*) FROM base WHERE (first_clicked_at AT TIME ZONE '${TIME_ZONE}')::date = days.day)::int AS clicked
     FROM days ORDER BY days.day`,
    [from, to, type],
  );
  return result.rows;
}

export type BreakdownRow = Metrics & { key: string; label: string; sub?: string | null; href?: string | null };

export async function getBreakdowns(from: string, to: string, type: string) {
  const params = [from, to, type];
  const [byType, campaigns, flows, templates, domains] = await Promise.all([
    pool.query(`${COHORT} SELECT category AS key, ${METRIC_COLUMNS} FROM d GROUP BY category ORDER BY sent DESC`, params),
    pool.query(
      `${COHORT} SELECT d.campaign_id::text AS key, nc.subject AS label,
         to_char(min(d.sent_at) AT TIME ZONE '${TIME_ZONE}', 'DD Mon YYYY') AS sub, ${METRIC_COLUMNS}
       FROM d JOIN newsletter_campaigns nc ON nc.id = d.campaign_id
       GROUP BY d.campaign_id, nc.subject ORDER BY min(d.sent_at) DESC`,
      params,
    ),
    pool.query(
      `${COHORT} SELECT f.id || ':' || s.position AS key, f.name AS label,
         'Email ' || (s.position + 1) || ': ' || s.subject AS sub, f.id AS flow_id, ${METRIC_COLUMNS}
       FROM d JOIN email_flow_steps s ON s.id = d.flow_step_id JOIN email_flows f ON f.id = s.flow_id
       GROUP BY f.id, f.name, s.position, s.subject ORDER BY f.name, s.position`,
      params,
    ),
    pool.query(
      `${COHORT} SELECT d.template_key AS key, COALESCE(et.label, d.template_key) AS label, ${METRIC_COLUMNS}
       FROM d LEFT JOIN email_templates et ON et.key = d.template_key
       WHERE d.category NOT IN ('campaign', 'automation') AND d.template_key IS NOT NULL
       GROUP BY d.template_key, et.label ORDER BY sent DESC`,
      params,
    ),
    pool.query(
      `${COHORT} SELECT
         CASE
           WHEN split_part(lower(recipient_email), '@', 2) IN ('gmail.com', 'googlemail.com') THEN 'Gmail'
           WHEN split_part(lower(recipient_email), '@', 2) ~ '^(outlook|hotmail|live|msn)\\.' THEN 'Outlook / Hotmail'
           WHEN split_part(lower(recipient_email), '@', 2) ~ '^(yahoo|ymail|rocketmail)\\.' THEN 'Yahoo'
           WHEN split_part(lower(recipient_email), '@', 2) IN ('icloud.com', 'me.com', 'mac.com') THEN 'Apple iCloud'
           WHEN split_part(lower(recipient_email), '@', 2) IN ('rediffmail.com', 'rediff.com') THEN 'Rediffmail'
           ELSE 'Other (work and private domains)'
         END AS key, ${METRIC_COLUMNS}
       FROM d GROUP BY 1 ORDER BY sent DESC`,
      params,
    ),
  ]);
  return {
    byType: byType.rows as BreakdownRow[],
    campaigns: campaigns.rows as BreakdownRow[],
    flows: flows.rows as (BreakdownRow & { flow_id: number })[],
    templates: templates.rows as BreakdownRow[],
    domains: domains.rows as BreakdownRow[],
  };
}

/** Links clicked in the window, and opens by India hour of day. */
export async function getEngagementDetail(from: string, to: string, type: string) {
  const params = [from, to, type];
  const inWindow = (column: string) => `${column} >= ($1::date)::timestamp AT TIME ZONE '${TIME_ZONE}'
      AND ${column} < (($2::date) + 1)::timestamp AT TIME ZONE '${TIME_ZONE}'`;
  const [links, hours, problems] = await Promise.all([
    pool.query(
      // Query strings dropped: sign-in and verify links carry one-time tokens.
      `SELECT split_part(e.meta->>'target', '?', 1) AS url, count(*)::int AS clicks, count(DISTINCT e.delivery_id)::int AS people
       FROM email_events e JOIN email_deliveries ed ON ed.id = e.delivery_id
       WHERE e.event = 'clicked' AND NOT ed.is_test AND ($3 = '' OR ed.category = $3)
         AND e.meta->>'target' IS NOT NULL AND ${inWindow("e.created_at")}
       GROUP BY 1 ORDER BY people DESC, clicks DESC LIMIT 15`,
      params,
    ),
    pool.query(
      `SELECT extract(hour FROM COALESCE(first_opened_at, first_clicked_at) AT TIME ZONE '${TIME_ZONE}')::int AS hour,
         count(*)::int AS opens
       FROM email_deliveries
       WHERE NOT is_test AND ($3 = '' OR category = $3)
         AND ${inWindow("COALESCE(first_opened_at, first_clicked_at)")}
       GROUP BY 1 ORDER BY 1`,
      params,
    ),
    pool.query(
      `SELECT e.recipient_email, e.event, e.created_at, e.template_key,
         COALESCE(e.meta->>'bounce_type', e.meta->>'feedback_type', e.meta->>'source') AS detail
       FROM email_events e LEFT JOIN email_deliveries ed ON ed.id = e.delivery_id
       WHERE e.event IN ('hard_bounce', 'soft_bounce', 'spam', 'unsubscribed')
         AND (ed.id IS NULL OR NOT ed.is_test) AND ($3 = '' OR e.category = $3)
         AND ${inWindow("e.created_at")}
       ORDER BY e.created_at DESC LIMIT 50`,
      params,
    ),
  ]);
  const byHour = new Map<number, number>(hours.rows.map((r) => [r.hour, r.opens]));
  return {
    links: links.rows as { url: string; clicks: number; people: number }[],
    hours: Array.from({ length: 24 }, (_, hour) => ({ hour, opens: byHour.get(hour) || 0 })),
    problems: problems.rows as { recipient_email: string; event: string; created_at: string; template_key: string | null; detail: string | null }[],
  };
}

/** Who is active right now, independent of the date filter. */
export async function getAudience() {
  const result = await pool.query(`
    WITH engaged AS (
      SELECT contact_id, max(GREATEST(last_opened_at, last_clicked_at, first_opened_at)) AS last_at
      FROM email_deliveries WHERE NOT is_test AND contact_id IS NOT NULL
        AND (first_opened_at IS NOT NULL OR first_clicked_at IS NOT NULL)
      GROUP BY contact_id
    ),
    site AS (SELECT user_id, max(day) AS last_day FROM user_activity_days GROUP BY user_id),
    today AS (SELECT (now() AT TIME ZONE '${TIME_ZONE}')::date AS d)
    SELECT
      (SELECT count(*) FROM contacts)::int AS contacts,
      (SELECT count(*) FROM contacts c WHERE c.marketing_status = 'subscribed' AND c.deliverability_status = 'ok'
         AND NOT EXISTS (SELECT 1 FROM email_suppressions es WHERE es.email = c.normalized_email))::int AS marketable,
      (SELECT count(*) FROM engaged WHERE last_at >= now() - interval '7 days')::int AS email_7,
      (SELECT count(*) FROM engaged WHERE last_at >= now() - interval '30 days')::int AS email_30,
      (SELECT count(*) FROM engaged WHERE last_at >= now() - interval '90 days')::int AS email_90,
      (SELECT count(*) FROM site, today WHERE last_day > today.d - 7)::int AS site_7,
      (SELECT count(*) FROM site, today WHERE last_day > today.d - 30)::int AS site_30,
      (SELECT count(*) FROM site, today WHERE last_day > today.d - 90)::int AS site_90,
      (SELECT count(*) FROM contacts c WHERE c.marketing_status = 'subscribed'
         AND NOT EXISTS (SELECT 1 FROM engaged WHERE engaged.contact_id = c.id))::int AS subscribed_never_opened,
      (SELECT count(*) FROM contacts c WHERE c.marketing_status = 'subscribed'
         AND EXISTS (SELECT 1 FROM engaged WHERE engaged.contact_id = c.id)
         AND NOT EXISTS (SELECT 1 FROM engaged WHERE engaged.contact_id = c.id AND last_at >= now() - interval '90 days'))::int AS subscribed_quiet_90
  `);
  return result.rows[0] as Record<string, number>;
}
