import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import ContactActions from "@/components/ContactActions";
import { getReplyToEmail } from "@/lib/businessProfile";
import ContactActivity, {
  type BookingRow,
  type EmailRow,
  type PaymentRow,
  type TimelineRow,
} from "@/components/ContactActivity";
import ContactDeleteButton from "@/components/ContactDeleteButton";
import ContactEditForm from "@/components/ContactEditForm";
import ContactFormData from "@/components/ContactFormData";
import ContactMarketingToggle from "@/components/ContactMarketingToggle";
import ContactNotes from "@/components/ContactNotes";
import ContactWhatsAppToggle from "@/components/ContactWhatsAppToggle";
import { countryName } from "@/lib/countries";
import { listContactFormDetails } from "@/lib/formSubmission";

function parseContactId(id: string): { contactId: number | null; userId: number | null; email: string | null } {
  if (id.startsWith("c-")) {
    const contactId = Number(id.slice(2));
    return { contactId: Number.isInteger(contactId) ? contactId : null, userId: null, email: null };
  }
  if (id.startsWith("u-")) {
    const userId = Number(id.slice(2));
    return { contactId: null, userId: Number.isInteger(userId) ? userId : null, email: null };
  }
  if (id.startsWith("g-")) {
    return { contactId: null, userId: null, email: decodeURIComponent(id.slice(2)) };
  }
  return { contactId: null, userId: null, email: null };
}

/** One contact: who they are, what you can do to them, and what has
 * happened, in that order.
 *
 * Rebuilt 2026-10-22. It used to be ten always-open sections -- every email
 * they had ever been sent, every payment, every attribution event -- with
 * the things the owner could actually *do* scattered between them, and a
 * pipeline stage nobody used at the top. Now the record lists live in one
 * collapsed accordion and every action is in one block near the top. */
export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = parseContactId(id);
  if (!parsed.contactId && !parsed.userId && !parsed.email) notFound();

  const contactResult = await pool.query(
    `SELECT c.id, c.email, c.user_id, c.name, c.first_name, c.last_name, c.address,
            c.phone, c.marketing_status, c.deliverability_status, now() AS request_now,
            c.first_seen_at, c.last_seen_at, c.last_emailed_at, c.last_engaged_at,
            c.country, c.country_source, c.whatsapp_status
     FROM contacts c
     WHERE ($1::bigint IS NOT NULL AND c.id = $1)
        OR ($2::integer IS NOT NULL AND c.user_id = $2)
        OR ($3::text IS NOT NULL AND c.normalized_email = lower(trim($3)))
     LIMIT 1`,
    [parsed.contactId, parsed.userId, parsed.email],
  );
  const contact = contactResult.rows[0];
  if (!contact) notFound();
  const contactId = Number(contact.id);
  const formSubmissions = await pool.query<{
    id: number; form_id: number; name: string; source: string; field_values: Record<string, string>;
    fields: { key: string; label: string }[]; page_url: string; created_at: Date;
  }>(`SELECT fs.id, f.id AS form_id, f.name, f.source, fs.field_values, f.fields, fs.page_url, fs.created_at
      FROM form_submissions fs JOIN forms f ON f.id = fs.form_id
      WHERE fs.contact_id = $1 ORDER BY fs.created_at DESC LIMIT 50`, [contactId]);
  // Answers a form was told to promote onto the contact itself, rather than
  // leave sitting in the submission.
  const contactFormDetails = await listContactFormDetails(contactId);
  const userId = contact.user_id ? Number(contact.user_id) : null;
  const guestEmail = contact.email as string;

  let user = null as null | {
    id: number;
    email: string;
    name: string | null;
    created_at: string;
    username: string | null;
    last_seen_at: string | null;
  };

  if (userId) {
    const result = await pool.query(
      "SELECT id, email, name, created_at, username, last_seen_at FROM users WHERE id = $1",
      [userId],
    );
    user = result.rows[0] || null;
    if (!user) notFound();
  }

  const email = user?.email || guestEmail;

  const [
    attribution,
    enrollments,
    allCourses,
    payments,
    membership,
    notes,
    deliveries,
    whatsappMessages,
    contactActivities,
    googleLocation,
    meetings,
    webinarRegs,
  ] = await Promise.all([
    pool.query(
      "SELECT * FROM attribution_events WHERE user_id = $1 OR email = $2 ORDER BY created_at ASC",
      [userId, email],
    ),
    userId
      ? pool.query(
          `SELECT ce.id AS enrollment_id, ce.course_id, c.slug, c.title, ce.tier, ce.granted_via, ce.created_at,
             COUNT(l.id)::int AS total_lessons,
             COUNT(lp.id)::int AS completed_lessons
           FROM course_enrollments ce
           JOIN courses c ON c.id = ce.course_id
           LEFT JOIN course_modules m ON m.course_id = c.id
           LEFT JOIN course_lessons l ON l.module_id = m.id
           LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = ce.user_id
           WHERE ce.user_id = $1
           GROUP BY ce.id, c.id
           ORDER BY ce.created_at DESC`,
          [userId],
        )
      : Promise.resolve({ rows: [] }),
    pool.query(
      `SELECT c.id, c.title,
         EXISTS(SELECT 1 FROM course_modules m WHERE m.course_id = c.id AND m.tier = 'free') AS has_free_tier
       FROM courses c ORDER BY c.created_at DESC`,
    ),
    userId
      ? pool.query(
          `SELECT pc.id, pc.method, pc.reference, pc.status, pc.amount, pc.currency, pc.created_at, c.title AS course_title
           FROM payment_claims pc JOIN courses c ON c.id = pc.course_id
           WHERE pc.user_id = $1 ORDER BY pc.created_at DESC`,
          [userId],
        )
      : Promise.resolve({ rows: [] }),
    userId
      ? pool.query(
          "SELECT status, source, current_period_end, created_at FROM community_memberships WHERE user_id = $1",
          [userId],
        )
      : Promise.resolve({ rows: [] }),
    userId
      ? pool.query(
          "SELECT id, body, created_by, created_at FROM contact_notes WHERE user_id = $1 ORDER BY created_at DESC",
          [userId],
        )
      : Promise.resolve({ rows: [] }),
    pool.query(
      `SELECT id, subject, category, status, is_test, sent_at, delivered_at,
         first_opened_at, first_clicked_at, open_count, click_count, created_at
       FROM email_deliveries WHERE contact_id = $1 ORDER BY created_at DESC`,
      [contactId],
    ),
    pool.query(
      `SELECT id, direction, body, status, created_at
       FROM whatsapp_messages WHERE contact_id = $1 ORDER BY created_at DESC`,
      [contactId],
    ),
    pool.query(
      `SELECT id, activity_type, source, metadata, occurred_at
       FROM contact_activities WHERE contact_id = $1 ORDER BY occurred_at DESC`,
      [contactId],
    ),
    pool.query("SELECT 1 FROM site_settings WHERE key='google_review_url' AND value <> '' LIMIT 1"),
    pool.query(
      `SELECT mb.id, mb.scheduled_start, mb.status, mt.name AS meeting_type_name
       FROM meeting_bookings mb JOIN meeting_types mt ON mt.id = mb.meeting_type_id
       WHERE mb.contact_id = $1 ORDER BY mb.scheduled_start DESC`,
      [contactId],
    ),
    userId
      ? pool.query(
          `SELECT wa.id, wa.registered_at, wa.session_start_at, w.title
           FROM webinar_access wa JOIN webinars w ON w.id = wa.webinar_id
           WHERE wa.user_id = $1 ORDER BY wa.registered_at DESC`,
          [userId],
        )
      : Promise.resolve({ rows: [] }),
  ]);

  // The conversation itself lives in the WhatsApp inbox; the accordion
  // shows the last few and links across.
  const whatsappCount = Number(
    (await pool.query<{ n: string }>("SELECT count(*) AS n FROM whatsapp_messages WHERE contact_id = $1", [contactId]))
      .rows[0]?.n ?? 0,
  );

  const firstTouch = attribution.rows[0];
  const communityActive = membership.rows[0]?.status === "active";
  const emailEligible = contact.marketing_status !== "unsubscribed" && contact.deliverability_status === "ok";
  const lastSeenAt = user?.last_seen_at || contact.last_seen_at;
  const lastSeenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
  const nowMs = new Date(contact.request_now).getTime();
  const isActive = lastSeenMs > 0 && nowMs - lastSeenMs <= 10 * 60 * 1000;
  const lastSeenLabel = lastSeenMs > 0
    ? (() => {
        const minutes = Math.max(1, Math.floor((nowMs - lastSeenMs) / 60000));
        if (minutes < 60) return `Last seen ${minutes} min${minutes === 1 ? "" : "s"} ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `Last seen ${hours} hour${hours === 1 ? "" : "s"} ago`;
        const days = Math.floor(hours / 24);
        return `Last seen ${days} day${days === 1 ? "" : "s"} ago`;
      })()
    : "No recent site activity";
  // Rendered on the server, so a bare toLocaleDateString() would use the
  // container locale (US) and print 8/30/2026 to someone reading dates the
  // other way round. Same format as the activity list.
  const onDate = (value: string | Date) =>
    new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

  // Engaged means they opened or clicked something we sent, which is a
  // different question from whether they were on the site.
  const lastEngagedLabel = contact.last_engaged_at
    ? `Last engaged ${onDate(contact.last_engaged_at)}`
    : "Never engaged with an email";
  const joinedLabel = user
    ? onDate(user.created_at)
    : contact.first_seen_at
      ? onDate(contact.first_seen_at)
      : "Unknown";

  // Recorded actions and raw attribution events are the same kind of thing
  // to the person reading them, so they go in one list, newest first.
  const timeline: TimelineRow[] = [
    ...contactActivities.rows.map((row) => ({
      id: `activity-${row.id}`,
      kind: "activity",
      label: String(row.activity_type).replace(/_/g, " "),
      detail: row.activity_type === "form_submitted" ? String(row.metadata?.label || row.source) : String(row.source).replace(/_/g, " "),
      at: new Date(row.occurred_at).toISOString(),
    })),
    ...attribution.rows.map((row) => ({
      id: `attribution-${row.id}`,
      kind: "attribution",
      label: String(row.event_type).replace(/_/g, " "),
      detail: row.landing_page ? String(row.landing_page) : null,
      at: new Date(row.created_at).toISOString(),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const bookings: BookingRow[] = [
    ...meetings.rows.map((row) => ({
      id: `meeting-${row.id}`,
      title: String(row.meeting_type_name),
      detail: String(row.status),
      at: new Date(row.scheduled_start).toISOString(),
    })),
    ...webinarRegs.rows.map((row) => ({
      id: `webinar-${row.id}`,
      title: String(row.title),
      detail: row.session_start_at ? "attended" : "registered",
      at: new Date(row.registered_at).toISOString(),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">
              {user ? "Account" : "Guest — no account yet"}
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{user?.name || contact.name || email}</h1>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <ContactEditForm
              contactId={contactId}
              initialName={contact.name || ""}
              initialFirstName={contact.first_name || ""}
              initialLastName={contact.last_name || ""}
              initialPhone={contact.phone || ""}
              initialCountry={contact.country || ""}
              initialAddress={contact.address || ""}
            />
            <ContactDeleteButton contactId={contactId} label={email} hasAccount={!!user} />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
          <span>{email}</span>
          {contact.phone && <><span aria-hidden="true">·</span><span>{contact.phone}</span></>}
          {contact.country && <><span aria-hidden="true">·</span><span>{countryName(contact.country)}</span></>}
          {contact.address && <><span aria-hidden="true">·</span><span>{contact.address}</span></>}
        </div>
      </div>

      <section className="rounded-2xl border border-line bg-paper p-6">
        <h2 className="font-display text-lg font-semibold">Identity and consent</h2>
        {/* Who they are on the left, what they have agreed to on the right.
            The two used to sit in one five-column row where a contact ID, a
            consent control and a deliverability word all looked alike. */}
        <div className="mt-4 grid gap-x-10 gap-y-5 sm:grid-cols-2">
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-soft">Contact ID</dt>
              <dd className="font-medium">#{contactId}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-soft">First name</dt>
              <dd className="font-medium">{contact.first_name || "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-soft">Last name</dt>
              <dd className="font-medium">{contact.last_name || "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-soft">Phone</dt>
              <dd className="font-medium">{contact.phone || "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-soft">Country</dt>
              <dd className="font-medium">{contact.country ? countryName(contact.country) : "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="shrink-0 text-ink-soft">Address</dt>
              <dd className="whitespace-pre-wrap text-right font-medium">{contact.address || "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-soft">Username</dt>
              <dd className="min-w-0 truncate font-medium">
                {user ? (user.username ? `@${user.username}` : "Not set") : "No account"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-soft">{user ? "Joined" : "First seen"}</dt>
              <dd className="font-medium">{joinedLabel}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-soft">Deliverability</dt>
              <dd className="font-medium capitalize">{contact.deliverability_status}</dd>
            </div>
          </dl>

          {/* A grid, not two rows of justify-between: the state word sits
              after its switch and "Subscribed" is wider than "Opted in",
              so flowing them right put the two switches at different
              positions. Sharing a column lines them up whatever they say.
              content-start matters as much: this block is a grid item next
              to a taller one, and auto rows stretch to fill, which pushed
              the two rows a long way apart. */}
          <div className="grid grid-cols-[1fr_auto] content-start items-center gap-x-6 gap-y-2 text-sm">
            <span className="text-ink-soft">Marketing emails</span>
            <ContactMarketingToggle
              contactId={contactId}
              status={contact.marketing_status}
              deliverability={contact.deliverability_status}
            />
            <span className="text-ink-soft">WhatsApp</span>
            <ContactWhatsAppToggle
              contactId={contactId}
              status={contact.whatsapp_status}
              hasPhone={!!contact.phone}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-4 text-xs text-ink-soft">
          <span className="font-medium text-ink-soft">Status</span>
          <span aria-hidden="true">·</span>
          <span className={isActive ? "font-medium text-green-700" : ""}>{isActive ? "Active now" : lastSeenLabel}</span>
          <span aria-hidden="true">·</span>
          <span>{lastEngagedLabel}</span>
        </div>
      </section>

      <ContactActions
        contactId={contactId}
        name={user?.name || contact.name || null}
        email={email}
        phone={contact.phone || null}
        hasAccount={!!user}
        emailEligible={emailEligible}
        whatsappStatus={contact.whatsapp_status}
        whatsappMessageCount={whatsappCount}
        hasGoogleReviewLink={Boolean(googleLocation.rowCount)}
        communityActive={communityActive}
        courses={allCourses.rows.filter((c) => !enrollments.rows.some((e) => e.course_id === c.id))}
        replyToEmail={await getReplyToEmail()}
      />

      <ContactFormData
        contactId={contactId}
        details={contactFormDetails.map((detail) => ({
          id: Number(detail.id),
          field_key: detail.field_key,
          label: detail.label || detail.field_key,
          value: detail.value,
          form_name: detail.form_name,
          updated_at: new Date(detail.updated_at).toISOString(),
        }))}
        submissions={formSubmissions.rows.map((submission) => ({
          id: Number(submission.id),
          form_id: Number(submission.form_id),
          form_name: submission.name,
          source: submission.source || "",
          page_url: submission.page_url || "",
          created_at: new Date(submission.created_at).toISOString(),
          answers: (submission.fields || [])
            .filter((field) => Object.hasOwn(submission.field_values || {}, field.key))
            .map((field) => ({ label: field.label || field.key, value: submission.field_values[field.key] })),
        }))}
      />

      <ContactActivity
        contactId={contactId}
        now={new Date(contact.request_now).toISOString()}
        emails={deliveries.rows.map((row) => ({
          id: Number(row.id),
          subject: String(row.subject),
          category: row.category,
          status: String(row.status),
          is_test: !!row.is_test,
          created_at: new Date(row.created_at).toISOString(),
          sent_at: row.sent_at ? new Date(row.sent_at).toISOString() : null,
          delivered_at: row.delivered_at ? new Date(row.delivered_at).toISOString() : null,
          first_opened_at: row.first_opened_at ? new Date(row.first_opened_at).toISOString() : null,
          first_clicked_at: row.first_clicked_at ? new Date(row.first_clicked_at).toISOString() : null,
          open_count: Number(row.open_count || 0),
          click_count: Number(row.click_count || 0),
        })) as EmailRow[]}
        whatsapp={whatsappMessages.rows.map((row) => ({
          id: Number(row.id),
          direction: String(row.direction),
          body: row.body,
          status: row.status,
          created_at: new Date(row.created_at).toISOString(),
        }))}
        whatsappCount={whatsappCount}
        courses={enrollments.rows.map((row) => ({
          enrollment_id: Number(row.enrollment_id),
          title: String(row.title),
          tier: String(row.tier),
          total_lessons: Number(row.total_lessons || 0),
          completed_lessons: Number(row.completed_lessons || 0),
          created_at: new Date(row.created_at).toISOString(),
        }))}
        payments={payments.rows.map((row) => ({
          id: Number(row.id),
          course_title: String(row.course_title),
          amount: row.amount != null ? String(row.amount) : null,
          currency: row.currency,
          method: String(row.method),
          status: String(row.status),
          created_at: new Date(row.created_at).toISOString(),
        })) as PaymentRow[]}
        bookings={bookings}
        timeline={timeline}
        source={
          // A visit with no UTM tags still has a landing page and/or a
          // referrer worth showing -- most direct-signup traffic (an
          // internal nav link, a blog post, a bookmark) never carries UTM
          // params at all, so gating this on utm_* alone silently hid the
          // one thing that actually answers "where did this contact come
          // from" for the majority of contacts.
          firstTouch && (firstTouch.utm_source || firstTouch.utm_medium || firstTouch.utm_campaign || firstTouch.landing_page || firstTouch.referrer)
            ? {
                utm_source: firstTouch.utm_source,
                utm_medium: firstTouch.utm_medium,
                utm_campaign: firstTouch.utm_campaign,
                landing_page: firstTouch.landing_page,
                referrer: firstTouch.referrer,
                at: new Date(firstTouch.created_at).toISOString(),
              }
            : null
        }
      />

      <section className="rounded-2xl border border-line bg-paper p-6">
        <h2 className="font-display text-lg font-semibold">Notes</h2>
        {!user ? (
          <p className="mt-2 text-sm text-ink-soft">Notes are only available once this person has an account.</p>
        ) : (
          <ContactNotes userId={user.id} notes={notes.rows} />
        )}
      </section>
    </div>
  );
}
