import { pool } from "@/lib/db";
import ConsoleReviewCard from "@/components/ConsoleReviewCard";
import ConsoleReviewHub from "@/components/ConsoleReviewHub";
import { googleBusinessConfigured } from "@/lib/googleBusiness";

export default async function ConsoleReviewsPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const googleResult = (await searchParams).google || "";
  const [result, connection, locations, contacts, templates, googleReviews, requests] = await Promise.all([pool.query(
    `SELECT r.id, r.name, r.role, r.website, r.rating, r.message, r.status, r.created_at, r.admin_note,
            r.screenshots, r.youtube_id,
            (u.email IS NOT NULL) AS has_contact_email
     FROM review_submissions r
     LEFT JOIN users u ON u.id = r.user_id
     ORDER BY r.created_at DESC LIMIT 200`
  ), pool.query(`SELECT status,last_error,last_checked_at FROM google_business_connections WHERE disconnected_at IS NULL ORDER BY id DESC LIMIT 1`),
  pool.query(`SELECT l.id,l.title,l.address_text,l.selected,l.review_url,l.show_publicly,(l.account_name='manual') AS is_manual FROM google_business_locations l JOIN google_business_connections c ON c.id=l.connection_id WHERE c.disconnected_at IS NULL ORDER BY l.selected DESC,l.title`),
  pool.query(`SELECT id,email,name,phone FROM contacts WHERE marketing_status='subscribed' AND deliverability_status='ok' ORDER BY COALESCE(name,email) LIMIT 500`),
  pool.query(`SELECT key,label FROM email_templates WHERE key IN ('google-review-request','google-review-reminder') ORDER BY CASE WHEN key='google-review-request' THEN 0 ELSE 1 END`),
  pool.query(`SELECT review_id,reviewer_name,star_rating,comment,create_time,reply_comment FROM google_reviews WHERE expires_at>now() ORDER BY COALESCE(update_time,create_time) DESC LIMIT 100`),
  pool.query(`SELECT r.id,c.name,c.email,r.channel,r.whatsapp_template_key,r.status,r.scheduled_for,r.sent_at,d.delivered_at,d.first_opened_at,r.clicked_at,r.last_error FROM review_requests r JOIN contacts c ON c.id=r.contact_id LEFT JOIN email_deliveries d ON d.id=r.email_delivery_id ORDER BY r.created_at DESC LIMIT 200`)]);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Reviews</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Manage honest review requests, official Google reviews, and website submissions without mixing their sources.
      </p>
      <div className="mt-8"><ConsoleReviewHub initialGoogleResult={googleResult} configured={googleBusinessConfigured()} notificationsConfigured={Boolean(process.env.GOOGLE_BUSINESS_PUBSUB_TOPIC&&process.env.GOOGLE_BUSINESS_PUBSUB_AUDIENCE&&process.env.GOOGLE_BUSINESS_PUBSUB_SERVICE_ACCOUNT)} connection={connection.rows[0]||null} locations={locations.rows} contacts={contacts.rows} templates={templates.rows} googleReviews={googleReviews.rows} requests={requests.rows}/></div>
      <h2 className="mt-12 font-display text-xl font-semibold">Website review submissions</h2>
      <p className="mt-1 text-sm text-ink-soft">Approved website reviews appear on the public Reviews page and remain separate from Google reviews.</p>
      <div className="mt-8 space-y-4">
        {result.rows.length === 0 && (
          <p className="text-sm text-ink-soft">No submissions yet.</p>
        )}
        {result.rows.map((r) => (
          <ConsoleReviewCard key={r.id} submission={r} />
        ))}
      </div>
    </div>
  );
}
