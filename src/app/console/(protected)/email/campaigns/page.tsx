import { pool } from "@/lib/db";
import ConsoleEmailCampaigns from "@/components/ConsoleEmailCampaigns";
import { getPublicPosts } from "@/lib/blogPosts";

export default async function EmailCampaignsPage() {
  const [result, sentSlugsResult] = await Promise.all([
    pool.query(`
      SELECT c.id, c.subject, c.status, c.created_at, c.sent_at, c.scheduled_at,
        seg.name AS segment_name, c.last_error,
        COUNT(s.id) FILTER (WHERE s.status = 'sent')::int AS sent_count,
        COUNT(s.id) FILTER (WHERE s.status = 'skipped')::int AS skipped_count,
        COUNT(s.id) FILTER (WHERE s.status = 'failed')::int AS failed_count,
        COUNT(s.id)::int AS recipient_count,
        COUNT(s.id) FILTER (WHERE ed.first_opened_at IS NOT NULL)::int AS opened_count,
        COUNT(s.id) FILTER (WHERE ed.first_clicked_at IS NOT NULL)::int AS clicked_count,
        COUNT(s.id) FILTER (WHERE ed.status IN ('bounced', 'complained'))::int AS bounced_count
      FROM newsletter_campaigns c
      LEFT JOIN contact_segments seg ON seg.id = c.segment_id
      LEFT JOIN newsletter_sends s ON s.campaign_id = c.id
      LEFT JOIN email_deliveries ed ON ed.id = s.email_delivery_id
      GROUP BY c.id, seg.name
      ORDER BY c.created_at DESC
    `),
    pool.query(`SELECT DISTINCT source_post_slug FROM newsletter_campaigns WHERE source_post_slug IS NOT NULL AND status != 'draft'`),
  ]);

  const sentSlugs = new Set(sentSlugsResult.rows.map((r) => r.source_post_slug));
  const recentPosts = [...(await getPublicPosts())]
    .sort((a, b) => (a.published_at < b.published_at ? 1 : -1))
    .slice(0, 20)
    .map((p) => ({ slug: p.slug, title: p.title, alreadySent: sentSlugs.has(p.slug) }));

  return (
    <div>
      <p className="max-w-2xl text-sm text-ink-soft">
        One-off emails to your newsletter subscribers — not tied to any trigger. Draft it, send yourself a test,
        then send now or schedule it in IST.
      </p>
      <div className="mt-8">
        <ConsoleEmailCampaigns campaigns={result.rows} recentPosts={recentPosts} />
      </div>
    </div>
  );
}
