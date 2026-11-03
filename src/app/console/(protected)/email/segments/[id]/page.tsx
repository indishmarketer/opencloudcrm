import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import { buildSegmentPredicate } from "@/lib/contactSegments";
import ContactsList from "@/components/ContactsList";

export default async function SegmentContactsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const segmentId = Number(id);
  if (!Number.isInteger(segmentId)) notFound();
  const segment = await pool.query("SELECT id, name, description, rules FROM contact_segments WHERE id = $1", [segmentId]);
  if (!segment.rows[0]) notFound();
  const predicate = buildSegmentPredicate(segment.rows[0].rules);
  const [contacts, courses] = await Promise.all([
    pool.query(
      `SELECT c.id AS contact_id, c.user_id, c.email, COALESCE(c.name, u.name) AS name, c.phone,
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
         EXISTS (SELECT 1 FROM directory_tools dt WHERE dt.submitted_by_user_id = c.user_id) AS has_tool_submission
       FROM contacts c LEFT JOIN users u ON u.id = c.user_id
       WHERE ${predicate.sql} ORDER BY c.last_engaged_at DESC NULLS LAST, c.first_seen_at DESC`,
      predicate.values,
    ),
    pool.query(`SELECT id, title FROM courses ORDER BY title`),
  ]);
  return (
    <div>
      <Link href="/console/email/segments" className="text-sm text-ink-soft hover:text-ink">← Segments</Link>
      <h2 className="mt-3 font-display text-2xl font-semibold">{segment.rows[0].name}</h2>
      {segment.rows[0].description && <p className="mt-1 text-sm text-ink-soft">{segment.rows[0].description}</p>}
      <p className="mt-2 text-sm text-ink-soft">This is a live list. Opens, clicks, purchases, enrollments, consent, and other profile actions update membership automatically.</p>
      <div className="mt-6"><ContactsList rows={contacts.rows} courses={courses.rows} /></div>
    </div>
  );
}
