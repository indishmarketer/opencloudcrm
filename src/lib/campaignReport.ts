import { pool } from "@/lib/db";

/** One campaign's results, for /console/email/campaigns/[id]. The audience
 * is frozen in newsletter_sends when sending starts; each sent row links to
 * its email_deliveries row, which carries delivery, open, click and bounce
 * state. Test sends never appear here (they have no newsletter_sends row). */

export type RecipientState =
  | "queued"
  | "failed"
  | "skipped"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained";

export type CampaignRecipient = {
  contact_id: number | null;
  email: string;
  state: RecipientState;
  sent_at: string | null;
  first_opened_at: string | null;
  open_count: number;
  first_clicked_at: string | null;
  click_count: number;
  unsubscribed: boolean;
  /** Bounce type, skip reason or send error. */
  detail: string | null;
};

export type CampaignSummary = {
  recipients: number;
  queued: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  failed: number;
  skipped: number;
  first_sent_at: string | null;
  last_sent_at: string | null;
};

const RECIPIENTS = `
  SELECT s.contact_id, COALESCE(ed.recipient_email, ct.email) AS email,
    CASE
      WHEN s.status = 'pending' THEN 'queued'
      WHEN s.status = 'failed' THEN 'failed'
      WHEN s.status = 'skipped' THEN 'skipped'
      WHEN ed.status = 'bounced' THEN 'bounced'
      WHEN ed.status = 'complained' THEN 'complained'
      WHEN ed.first_clicked_at IS NOT NULL THEN 'clicked'
      WHEN ed.first_opened_at IS NOT NULL THEN 'opened'
      WHEN ed.delivered_at IS NOT NULL OR ed.status = 'delivered' THEN 'delivered'
      ELSE 'sent'
    END AS state,
    COALESCE(ed.sent_at, s.sent_at) AS sent_at,
    ed.first_opened_at, COALESCE(ed.open_count, 0) AS open_count,
    ed.first_clicked_at, COALESCE(ed.click_count, 0) AS click_count,
    EXISTS (SELECT 1 FROM email_events e WHERE e.delivery_id = ed.id AND e.event = 'unsubscribed') AS unsubscribed,
    COALESCE(
      (SELECT COALESCE(e.meta->>'bounce_type', e.meta->>'feedback_type', e.event)
         FROM email_events e WHERE e.delivery_id = ed.id AND e.event IN ('hard_bounce', 'soft_bounce', 'spam')
         ORDER BY e.created_at DESC LIMIT 1),
      s.skipped_reason, ed.last_error, s.last_error
    ) AS detail
  FROM newsletter_sends s
  LEFT JOIN email_deliveries ed ON ed.id = s.email_delivery_id
  LEFT JOIN contacts ct ON ct.id = s.contact_id
  WHERE s.campaign_id = $1`;

export async function getCampaignReport(campaignId: number) {
  const [recipients, links] = await Promise.all([
    pool.query(
      `${RECIPIENTS}
       ORDER BY CASE WHEN s.status = 'pending' THEN 1 ELSE 0 END, COALESCE(ed.sent_at, s.sent_at) DESC NULLS LAST, s.id`,
      [campaignId],
    ),
    pool.query(
      // Query strings dropped so tracking parameters don't split one link into many.
      `SELECT split_part(e.meta->>'target', '?', 1) AS url, count(*)::int AS clicks, count(DISTINCT e.delivery_id)::int AS people
       FROM email_events e
       JOIN email_deliveries ed ON ed.id = e.delivery_id
       JOIN newsletter_sends s ON s.email_delivery_id = ed.id
       WHERE s.campaign_id = $1 AND e.event = 'clicked' AND e.meta->>'target' IS NOT NULL
       GROUP BY 1 ORDER BY people DESC, clicks DESC LIMIT 15`,
      [campaignId],
    ),
  ]);

  const rows = recipients.rows as CampaignRecipient[];
  const count = (...states: RecipientState[]) => rows.filter((r) => states.includes(r.state)).length;
  const sentTimes = rows.map((r) => r.sent_at).filter((t): t is string => !!t).map((t) => new Date(t).getTime());
  const summary: CampaignSummary = {
    recipients: rows.length,
    queued: count("queued"),
    sent: count("sent", "delivered", "opened", "clicked", "bounced", "complained"),
    delivered: count("delivered", "opened", "clicked", "complained"),
    opened: count("opened", "clicked"),
    clicked: count("clicked"),
    bounced: count("bounced"),
    complained: count("complained"),
    unsubscribed: rows.filter((r) => r.unsubscribed).length,
    failed: count("failed"),
    skipped: count("skipped"),
    first_sent_at: sentTimes.length ? new Date(Math.min(...sentTimes)).toISOString() : null,
    last_sent_at: sentTimes.length ? new Date(Math.max(...sentTimes)).toISOString() : null,
  };

  return {
    summary,
    recipients: rows,
    links: links.rows as { url: string; clicks: number; people: number }[],
  };
}
