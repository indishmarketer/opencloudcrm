import { pool } from "@/lib/db";
import ContactsList from "@/components/ContactsList";
import ContactsActions from "@/components/ContactsActions";

export default async function ConsoleContactsPage() {
  const [result, courses] = await Promise.all([
    pool.query(`
      SELECT c.id AS contact_id, c.user_id, c.email, COALESCE(c.name, u.name) AS name, c.phone,
        c.first_seen_at AS first_seen, c.marketing_status, c.deliverability_status,
        (c.user_id IS NOT NULL) AS has_account,
        EXISTS (SELECT 1 FROM contact_submissions cs WHERE lower(trim(cs.email)) = c.normalized_email) AS has_contact,
        EXISTS (SELECT 1 FROM newsletter_subscribers ns WHERE lower(trim(ns.email)) = c.normalized_email) AS has_newsletter,
        EXISTS (SELECT 1 FROM product_leads pl WHERE pl.user_id = c.user_id) AS has_product_lead,
        EXISTS (SELECT 1 FROM course_enrollments ce WHERE ce.user_id = c.user_id) AS has_course,
        EXISTS (SELECT 1 FROM community_memberships cm WHERE cm.user_id = c.user_id) AS has_community,
        (EXISTS (SELECT 1 FROM course_enrollments ce WHERE ce.user_id = c.user_id AND ce.tier = 'pro')
          OR EXISTS (SELECT 1 FROM community_memberships cm WHERE cm.user_id = c.user_id AND cm.status = 'active'
            AND (cm.current_period_end IS NULL OR cm.current_period_end > now()))) AS has_pro_access,
        COALESCE((SELECT array_agg(ce.course_id || ':' || ce.tier) FROM course_enrollments ce WHERE ce.user_id = c.user_id), '{}') AS enrollments,
        EXISTS (SELECT 1 FROM author_applications aa WHERE aa.user_id = c.user_id) AS has_author_application,
        -- India-time days with an email open/click or a signed-in website visit,
        -- for the activity filters ("opened in the last 7 days", custom ranges).
        COALESCE((SELECT array_agg(DISTINCT day ORDER BY day DESC) FROM (
          SELECT (e.created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS day FROM email_events e JOIN email_deliveries ed ON ed.id = e.delivery_id
            WHERE ed.contact_id = c.id AND NOT ed.is_test AND e.event IN ('opened', 'clicked')
          UNION SELECT (ed.first_opened_at AT TIME ZONE 'Asia/Kolkata')::date::text FROM email_deliveries ed WHERE ed.contact_id = c.id AND NOT ed.is_test AND ed.first_opened_at IS NOT NULL
          UNION SELECT (ed.last_opened_at AT TIME ZONE 'Asia/Kolkata')::date::text FROM email_deliveries ed WHERE ed.contact_id = c.id AND NOT ed.is_test AND ed.last_opened_at IS NOT NULL
          UNION SELECT (ed.last_clicked_at AT TIME ZONE 'Asia/Kolkata')::date::text FROM email_deliveries ed WHERE ed.contact_id = c.id AND NOT ed.is_test AND ed.last_clicked_at IS NOT NULL
        ) o), '{}') AS open_days,
        COALESCE((SELECT array_agg(DISTINCT day ORDER BY day DESC) FROM (
          SELECT (e.created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS day FROM email_events e JOIN email_deliveries ed ON ed.id = e.delivery_id
            WHERE ed.contact_id = c.id AND NOT ed.is_test AND e.event = 'clicked'
          UNION SELECT (ed.first_clicked_at AT TIME ZONE 'Asia/Kolkata')::date::text FROM email_deliveries ed WHERE ed.contact_id = c.id AND NOT ed.is_test AND ed.first_clicked_at IS NOT NULL
          UNION SELECT (ed.last_clicked_at AT TIME ZONE 'Asia/Kolkata')::date::text FROM email_deliveries ed WHERE ed.contact_id = c.id AND NOT ed.is_test AND ed.last_clicked_at IS NOT NULL
        ) k), '{}') AS click_days,
        COALESCE((SELECT array_agg(ua.day::text ORDER BY ua.day DESC) FROM user_activity_days ua WHERE ua.user_id = c.user_id), '{}') AS site_days,
        EXISTS (SELECT 1 FROM directory_tools dt WHERE dt.submitted_by_user_id = c.user_id) AS has_tool_submission,
        EXISTS (SELECT 1 FROM contact_activities ca WHERE ca.contact_id = c.id AND ca.activity_type = 'webhook_lead') AS has_webhook_lead,
        COALESCE((SELECT array_agg(DISTINCT ca.source) FROM contact_activities ca WHERE ca.contact_id = c.id AND ca.activity_type = 'webhook_lead'), '{}') AS webhook_lead_sources
        ,COALESCE((SELECT array_agg(DISTINCT ca.metadata->>'label') FROM contact_activities ca WHERE ca.contact_id = c.id AND ca.activity_type = 'form_submitted' AND ca.metadata->>'label' IS NOT NULL), '{}') AS form_sources
      FROM contacts c
      LEFT JOIN users u ON u.id = c.user_id
      ORDER BY c.first_seen_at DESC
    `),
    pool.query(`SELECT id, title FROM courses ORDER BY title`),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Contacts</h1>
        <ContactsActions />
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        One canonical contact per normalized email, synchronized across accounts, newsletters, courses,
        payments, community, author applications, tool submissions, products, and email engagement.
      </p>
      <div className="mt-8">
        <ContactsList rows={result.rows} courses={courses.rows} />
      </div>
    </div>
  );
}
