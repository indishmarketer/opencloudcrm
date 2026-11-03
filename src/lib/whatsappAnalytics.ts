import { pool } from "@/lib/db";

/** WhatsApp reporting, built on the message log rather than on Meta's own
 * analytics API: every send, status report and inbound message is already
 * recorded in whatsapp_messages, and that is the only source that can tie a
 * delivery back to a contact, a template and a campaign.
 *
 * Deliberately no money figures. Meta's rates vary by message category and
 * by the recipient's country, and they change; a number invented from a
 * stale rate card would be worse than no number. What is shown instead is
 * what Meta itself reports per message: the category it billed under and
 * whether it was billable at all. */

export type WhatsAppTotals = {
  outbound: number;
  delivered: number;
  read: number;
  failed: number;
  inbound: number;
  conversations: number;
};

export type TemplateStat = {
  template_name: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
};

export type CampaignStat = {
  id: number;
  name: string;
  status: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  created_at: string;
};

export type PricingStat = { pricing_category: string | null; billable: number; free: number };

/** `delivered` counts read messages too: a message cannot be read without
 * having been delivered, and Meta only reports the furthest status it knows
 * about, so counting them separately would under-report delivery. */
const DELIVERED = "count(*) FILTER (WHERE direction = 'outbound' AND status IN ('delivered', 'read'))::int";

export async function whatsappTotals(days: number): Promise<WhatsAppTotals> {
  const result = await pool.query<WhatsAppTotals>(
    `SELECT
       count(*) FILTER (WHERE direction = 'outbound')::int AS outbound,
       ${DELIVERED} AS delivered,
       count(*) FILTER (WHERE direction = 'outbound' AND status = 'read')::int AS read,
       count(*) FILTER (WHERE direction = 'outbound' AND status = 'failed')::int AS failed,
       count(*) FILTER (WHERE direction = 'inbound')::int AS inbound,
       count(DISTINCT COALESCE('c-' || contact_id::text,
              'p-' || regexp_replace(COALESCE(from_number, to_number), '\\D', '', 'g')))::int AS conversations
     FROM whatsapp_messages
     WHERE created_at >= now() - ($1 || ' days')::interval`,
    [days],
  );
  return (
    result.rows[0] || { outbound: 0, delivered: 0, read: 0, failed: 0, inbound: 0, conversations: 0 }
  );
}

export async function templateStats(days: number): Promise<TemplateStat[]> {
  const result = await pool.query<TemplateStat>(
    `SELECT template_name,
       count(*)::int AS sent,
       ${DELIVERED} AS delivered,
       count(*) FILTER (WHERE status = 'read')::int AS read,
       count(*) FILTER (WHERE status = 'failed')::int AS failed
     FROM whatsapp_messages
     WHERE direction = 'outbound' AND template_name IS NOT NULL
       AND created_at >= now() - ($1 || ' days')::interval
     GROUP BY template_name
     ORDER BY sent DESC`,
    [days],
  );
  return result.rows;
}

export async function campaignStats(days: number): Promise<CampaignStat[]> {
  const result = await pool.query<CampaignStat>(
    `SELECT c.id, c.name, c.status, c.created_at,
       count(s.id) FILTER (WHERE s.status = 'sent')::int AS sent,
       count(m.id) FILTER (WHERE m.status IN ('delivered', 'read'))::int AS delivered,
       count(m.id) FILTER (WHERE m.status = 'read')::int AS read,
       count(s.id) FILTER (WHERE s.status = 'failed')::int AS failed
     FROM whatsapp_campaigns c
     LEFT JOIN whatsapp_campaign_sends s ON s.campaign_id = c.id
     LEFT JOIN whatsapp_messages m ON m.wa_message_id = s.wa_message_id AND m.direction = 'outbound'
     WHERE c.created_at >= now() - ($1 || ' days')::interval
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [days],
  );
  return result.rows;
}

export async function pricingStats(days: number): Promise<PricingStat[]> {
  const result = await pool.query<PricingStat>(
    `SELECT
       COALESCE(
         pricing_category,
         CASE
           WHEN lower(template_name) LIKE '%otp%' THEN 'authentication'
           WHEN template_name IS NOT NULL THEN 'utility'
           ELSE 'service'
         END
       ) AS pricing_category,
       count(*) FILTER (WHERE billable IS TRUE OR (billable IS NULL AND (template_name IS NOT NULL OR lower(pricing_category) IN ('marketing', 'utility', 'authentication'))))::int AS billable,
       count(*) FILTER (WHERE billable IS FALSE OR (billable IS NULL AND template_name IS NULL AND (pricing_category IS NULL OR lower(pricing_category) = 'service')))::int AS free
     FROM whatsapp_messages
     WHERE direction = 'outbound'
       AND created_at >= now() - ($1 || ' days')::interval
     GROUP BY 1
     ORDER BY billable DESC`,
    [days],
  );
  return result.rows;
}

/** How many contacts can actually be messaged, which is the number that
 * decides whether a campaign is worth writing. */
export async function consentCounts(): Promise<{ subscribed: number; unknown: number; unsubscribed: number; reachable: number }> {
  const result = await pool.query<{ subscribed: number; unknown: number; unsubscribed: number; reachable: number }>(
    `SELECT
       count(*) FILTER (WHERE whatsapp_status = 'subscribed')::int AS subscribed,
       count(*) FILTER (WHERE whatsapp_status = 'unknown')::int AS unknown,
       count(*) FILTER (WHERE whatsapp_status = 'unsubscribed')::int AS unsubscribed,
       count(*) FILTER (WHERE whatsapp_status = 'subscribed' AND phone IS NOT NULL AND phone <> '')::int AS reachable
     FROM contacts`,
  );
  return result.rows[0] || { subscribed: 0, unknown: 0, unsubscribed: 0, reachable: 0 };
}
