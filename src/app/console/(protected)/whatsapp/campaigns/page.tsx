import ConsoleWhatsAppCampaigns from "@/components/ConsoleWhatsAppCampaigns";
import ModuleNotConfigured from "@/components/ModuleNotConfigured";
import { FEATURES } from "@/config/features";
import { pool } from "@/lib/db";
import { consentCounts } from "@/lib/whatsappAnalytics";
import { listWhatsAppTemplates } from "@/lib/whatsappTemplates";

export const dynamic = "force-dynamic";

export default async function WhatsAppCampaignsPage() {
  if (!FEATURES.whatsapp) return <ModuleNotConfigured title="WhatsApp isn't connected yet" envVars={["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_WABA_ID"]} />;

  const templates = await listWhatsAppTemplates().catch(() => []);

  const [campaigns, segments, consent] = await Promise.all([
    // Progress is joined here rather than fetched per campaign: delivered
    // and read come from Meta's status reports on the message id we
    // recorded when sending, which is a join, not a column.
    pool.query(
      `SELECT c.id, c.name, c.template_name, c.language, c.category, c.status, c.variables, c.header_media_url,
              c.button_url_param, c.button_url_index, c.segment_id, c.created_at, c.sent_at, c.last_error,
              s.name AS segment_name,
              count(sd.id)::int AS recipients,
              count(sd.id) FILTER (WHERE sd.status = 'pending')::int AS pending,
              count(sd.id) FILTER (WHERE sd.status = 'sent')::int AS sent,
              count(sd.id) FILTER (WHERE sd.status = 'failed')::int AS failed,
              count(sd.id) FILTER (WHERE sd.status = 'skipped')::int AS skipped,
              count(m.id) FILTER (WHERE m.status IN ('delivered', 'read'))::int AS delivered,
              count(m.id) FILTER (WHERE m.status = 'read')::int AS read
       FROM whatsapp_campaigns c
       LEFT JOIN contact_segments s ON s.id = c.segment_id
       LEFT JOIN whatsapp_campaign_sends sd ON sd.campaign_id = c.id
       LEFT JOIN whatsapp_messages m ON m.wa_message_id = sd.wa_message_id AND m.direction = 'outbound'
       GROUP BY c.id, s.name
       ORDER BY c.created_at DESC
       LIMIT 50`,
    ),
    pool.query("SELECT id, name FROM contact_segments ORDER BY is_system DESC, name"),
    consentCounts(),
  ]);

  return (
    <ConsoleWhatsAppCampaigns
      campaigns={campaigns.rows.map((row) => ({
        ...row,
        id: Number(row.id),
        created_at: new Date(row.created_at).toISOString(),
        sent_at: row.sent_at ? new Date(row.sent_at).toISOString() : null,
      }))}
      segments={segments.rows.map((row) => ({ id: Number(row.id), name: row.name as string }))}
      templates={templates.filter((t) => t.status === "APPROVED" && t.category !== "AUTHENTICATION")}
      reachable={consent.reachable}
    />
  );
}
