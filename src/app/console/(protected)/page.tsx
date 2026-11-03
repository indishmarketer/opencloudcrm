import Link from "next/link";
import { pool } from "@/lib/db";
import { getCachedAnalytics } from "@/lib/analyticsSources";
import { getAllPostsIncludingDrafts, getPublicPosts } from "@/lib/blogPosts";
import ConsoleRecentSignups from "@/components/ConsoleRecentSignups";
import ConsoleOverviewChart from "@/components/ConsoleOverviewChart";

export const dynamic = "force-dynamic";

export default async function ConsoleHome() {
  const [
    salesQuery,
    leadsQuery,
    usersQuery,
    recentSignupsQuery,
    communityQuery,
    toolsQuery,
    emailQuery,
    coursesQuery,
    guidesQuery,
    whatsappQuery,
    meetingsQuery,
    reviewsQuery,
    attentionQuery,
    attributionTrendQuery,
    usersTrendQuery,
    revenueTrendQuery,
    publicBlogPosts,
  ] = await Promise.all([
    // 1. Sales & Revenue
    pool.query(`
      SELECT 
        COUNT(*)::int AS sales_count,
        COALESCE(SUM(amount) FILTER (WHERE currency = 'INR' OR currency IS NULL), 0)::numeric AS revenue_inr,
        COALESCE(SUM(amount) FILTER (WHERE currency = 'USD'), 0)::numeric AS revenue_usd,
        COUNT(DISTINCT user_id)::int AS paying_customers
      FROM payment_claims 
      WHERE status = 'approved'
    `),
    // 2. Total Leads (inquiries, product leads, verified subscribers, webhook leads)
    pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM contact_submissions) +
        (SELECT COUNT(*)::int FROM product_leads) +
        (SELECT COUNT(*)::int FROM newsletter_subscribers WHERE verified = true AND unsubscribed_at IS NULL) +
        COALESCE((SELECT COUNT(DISTINCT contact_id)::int FROM contact_activities WHERE activity_type = 'webhook_lead'), 0) AS total_leads,
        (SELECT COUNT(*)::int FROM newsletter_subscribers WHERE verified = true AND unsubscribed_at IS NULL) AS newsletter_subscribers
    `),
    // 3. User Accounts
    pool.query(`
      SELECT 
        COUNT(*)::int AS total_users,
        COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS new_7d
      FROM users
    `),
    // 4. Recent Signups (masked by default in client component)
    pool.query(`
      SELECT id, name, email, created_at 
      FROM users 
      ORDER BY created_at DESC 
      LIMIT 6
    `),
    // 5. Community Stats
    pool.query(`
      SELECT 
        (SELECT COUNT(*)::int FROM users WHERE username IS NOT NULL) AS members,
        (SELECT COUNT(*)::int FROM users WHERE last_seen_at > now() - interval '7 days') AS active_week,
        (SELECT COUNT(*)::int FROM forum_posts WHERE status = 'approved') AS approved_posts,
        (SELECT COUNT(*)::int FROM forum_posts WHERE status = 'pending') +
        (SELECT COUNT(*)::int FROM forum_comments WHERE status = 'pending') AS pending_moderation
    `),
    // 6. Tools Directory Stats
    pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'published')::int AS published,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
      FROM directory_tools
    `),
    // 7. Email Stats
    pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM email_flows WHERE active = true) AS active_flows,
        (SELECT COUNT(*)::int FROM email_flow_scheduled WHERE status = 'sent' AND sent_at > now() - interval '30 days') AS sent_30d,
        (SELECT COUNT(*)::int FROM email_flow_scheduled WHERE status = 'pending') AS queued
    `),
    // 8. Courses Stats
    pool.query(`
      SELECT
        COUNT(*)::int AS total_courses,
        COUNT(*) FILTER (WHERE published = true)::int AS published_courses,
        (SELECT COUNT(*)::int FROM course_enrollments) AS total_enrollments
      FROM courses
    `).catch(() => ({ rows: [{ total_courses: 0, published_courses: 0, total_enrollments: 0 }] })),
    // 9. Free Guides Stats
    pool.query(`
      SELECT
        COUNT(*)::int AS total_guides,
        COUNT(*) FILTER (WHERE published = true)::int AS published_guides
      FROM lead_magnets
    `).catch(() => ({ rows: [{ total_guides: 0, published_guides: 0 }] })),
    // 10. WhatsApp Stats
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE direction = 'outbound')::int AS sent,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND status IN ('delivered', 'read'))::int AS delivered
      FROM whatsapp_messages
    `).catch(() => ({ rows: [{ sent: 0, delivered: 0 }] })),
    // 11. Meetings Stats
    pool.query(`
      SELECT
        COUNT(*)::int AS total_meetings,
        COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_meetings,
        COUNT(*) FILTER (WHERE scheduled_start >= now() AND status = 'confirmed')::int AS upcoming_meetings
      FROM meeting_bookings
    `).catch(() => ({ rows: [{ total_meetings: 0, confirmed_meetings: 0, upcoming_meetings: 0 }] })),
    // 12. Reviews Stats
    pool.query(`
      SELECT
        COUNT(*)::int AS total_reviews,
        COUNT(*) FILTER (WHERE status = 'approved')::int AS approved_reviews,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_reviews
      FROM review_submissions
    `).catch(() => ({ rows: [{ total_reviews: 0, approved_reviews: 0, pending_reviews: 0 }] })),
    // 13. Actionable Attention Queue
    pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM contact_submissions WHERE replied_at IS NULL) AS unreplied_support,
        (SELECT COUNT(*)::int FROM review_submissions WHERE status = 'pending') AS pending_reviews,
        (SELECT COUNT(*)::int FROM payment_claims WHERE status = 'pending') AS pending_claims
    `),
    // 14. Attribution trend (last 30d)
    pool.query(`
      SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS value
      FROM attribution_events
      WHERE event_type IN ('contact','newsletter','product_lead','signup')
        AND created_at >= now() - interval '30 days'
      GROUP BY day ORDER BY day
    `).catch(() => ({ rows: [] })),
    // 15. Users trend (last 30d)
    pool.query(`
      SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS value
      FROM users
      WHERE created_at >= now() - interval '30 days'
      GROUP BY day ORDER BY day
    `).catch(() => ({ rows: [] })),
    // 16. Revenue trend (last 30d)
    pool.query(`
      SELECT date_trunc('day', created_at) AS day, SUM(amount)::int AS value
      FROM payment_claims
      WHERE status = 'approved' AND amount IS NOT NULL AND created_at >= now() - interval '30 days'
      GROUP BY day ORDER BY day
    `).catch(() => ({ rows: [] })),
    // 17. Blog posts list
    getPublicPosts().catch(() => []),
  ]);

  const allBlogPosts = await getAllPostsIncludingDrafts();
  const publishedBlogCount = publicBlogPosts.length;
  const totalBlogCount = allBlogPosts.length;

  // Analytics data (Search Console + Bing + GA4)
  const { ga4, searchConsole, bing } = await getCachedAnalytics().catch(() => ({
    ga4: { error: "Unreachable" },
    searchConsole: { error: "Unreachable" },
    bing: { error: "Unreachable" },
  }));

  const scClicks = !("error" in searchConsole) ? Number(searchConsole.clicks) || 0 : 0;
  const bingClicks = !("error" in bing) ? Number(bing.clicks) || 0 : 0;
  const combinedSearchClicks = scClicks + bingClicks;
  const ga4Sessions = !("error" in ga4) ? Number(ga4.sessions) || 0 : null;

  const sales = salesQuery.rows[0] || { sales_count: 0, revenue_inr: 0, revenue_usd: 0, paying_customers: 0 };
  const leads = leadsQuery.rows[0] || { total_leads: 0, newsletter_subscribers: 0 };
  const users = usersQuery.rows[0] || { total_users: 0, new_7d: 0 };
  const community = communityQuery.rows[0] || { members: 0, active_week: 0, approved_posts: 0, pending_moderation: 0 };
  const tools = toolsQuery.rows[0] || { total: 0, published: 0, pending: 0 };
  const emails = emailQuery.rows[0] || { active_flows: 0, sent_30d: 0, queued: 0 };
  const courses = coursesQuery.rows[0] || { total_courses: 0, published_courses: 0, total_enrollments: 0 };
  const guides = guidesQuery.rows[0] || { total_guides: 0, published_guides: 0 };
  const whatsapp = whatsappQuery.rows[0] || { sent: 0, delivered: 0 };
  const meetings = meetingsQuery.rows[0] || { total_meetings: 0, confirmed_meetings: 0, upcoming_meetings: 0 };
  const reviews = reviewsQuery.rows[0] || { total_reviews: 0, approved_reviews: 0, pending_reviews: 0 };
  const attention = attentionQuery.rows[0] || { unreplied_support: 0, pending_reviews: 0, pending_claims: 0 };

  // Format trend data
  const rawLeads = attributionTrendQuery.rows.length > 0 ? attributionTrendQuery.rows : usersTrendQuery.rows;
  const leadsSeries = rawLeads.map((r: { day: string | Date; value: number }) => ({
    day: new Date(r.day).toISOString(),
    value: Number(r.value),
  }));

  const revenueSeries = revenueTrendQuery.rows.map((r: { day: string | Date; value: number }) => ({
    day: new Date(r.day).toISOString(),
    value: Number(r.value),
  }));

  const hasPendingActions =
    attention.unreplied_support > 0 ||
    attention.pending_reviews > 0 ||
    attention.pending_claims > 0 ||
    community.pending_moderation > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Overview</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Core performance indicators, audience growth, and system health.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-medium text-ink-soft">Live on load</span>
        </div>
      </div>

      {/* Action Items Alert Strip (Only appears when attention is actually needed) */}
      {hasPendingActions && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50/70 p-4 text-xs text-amber-900 sm:p-5">
          <span className="font-semibold uppercase tracking-wider text-amber-800">Action required:</span>
          <div className="flex flex-wrap items-center gap-2">
            {attention.unreplied_support > 0 && (
              <Link
                href="/console/support"
                className="rounded-full bg-white px-3 py-1 font-medium shadow-sm transition-colors hover:bg-amber-100"
              >
                {attention.unreplied_support} support {attention.unreplied_support === 1 ? "ticket" : "tickets"} awaiting reply →
              </Link>
            )}
            {attention.pending_claims > 0 && (
              <Link
                href="/console/courses"
                className="rounded-full bg-white px-3 py-1 font-medium shadow-sm transition-colors hover:bg-amber-100"
              >
                {attention.pending_claims} payment {attention.pending_claims === 1 ? "claim" : "claims"} to review →
              </Link>
            )}
            {attention.pending_reviews > 0 && (
              <Link
                href="/console/reviews"
                className="rounded-full bg-white px-3 py-1 font-medium shadow-sm transition-colors hover:bg-amber-100"
              >
                {attention.pending_reviews} {attention.pending_reviews === 1 ? "review" : "reviews"} pending moderation →
              </Link>
            )}
            {community.pending_moderation > 0 && (
              <Link
                href="/console/community"
                className="rounded-full bg-white px-3 py-1 font-medium shadow-sm transition-colors hover:bg-amber-100"
              >
                {community.pending_moderation} community {community.pending_moderation === 1 ? "post" : "posts"} to moderate →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Primary KPI Highlights (Top 4 Metrics) */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {/* 1. Sales & Revenue */}
        <Link
          href="/console/sales"
          className="group rounded-2xl border border-line bg-paper p-5 transition-all hover:border-ink hover:shadow-sm sm:p-6"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Sales &amp; Revenue</p>
          <p className="mt-2 font-display text-2xl font-semibold sm:text-3xl">
            {sales.sales_count}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {sales.paying_customers} {sales.paying_customers === 1 ? "customer" : "customers"}
          </p>
        </Link>

        {/* 2. Total Leads */}
        <Link
          href="/console/contacts?source=has_webhook_lead"
          className="group rounded-2xl border border-line bg-paper p-5 transition-all hover:border-ink hover:shadow-sm sm:p-6"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Total Leads</p>
          </div>
          <p className="mt-2 font-display text-2xl font-semibold sm:text-3xl">
            {leads.total_leads.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {leads.newsletter_subscribers} subscribers · webhook leads included
          </p>
        </Link>

        {/* 3. Registered Accounts */}
        <Link
          href="/console/contacts"
          className="group rounded-2xl border border-line bg-paper p-5 transition-all hover:border-ink hover:shadow-sm sm:p-6"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Registered Accounts</p>
          <p className="mt-2 font-display text-2xl font-semibold sm:text-3xl">
            {users.total_users.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            +{users.new_7d} new sign-ups this week
          </p>
        </Link>

        {/* 4. Combined Organic Search Clicks */}
        <Link
          href="/console/analytics"
          className="group rounded-2xl border border-line bg-paper p-5 transition-all hover:border-ink hover:shadow-sm sm:p-6"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Organic Search Clicks</p>
          <p className="mt-2 font-display text-2xl font-semibold sm:text-3xl">
            {combinedSearchClicks > 0 ? combinedSearchClicks.toLocaleString() : "0"}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {scClicks} Google + {bingClicks} Bing (28d)
          </p>
        </Link>
      </div>

      {/* 30-Day Activity & Growth Curve Chart */}
      <ConsoleOverviewChart leadsData={leadsSeries} revenueData={revenueSeries} />

      {/* Consolidated Platform Pillars (10 Core Areas) */}
      <div>
        <h2 className="font-display text-lg font-semibold sm:text-xl">Platform pillars</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5">
          {/* 1. Community */}
          <Link
            href="/console/community"
            className="group flex flex-col justify-between rounded-2xl border border-line bg-paper p-4 transition-all hover:border-ink hover:shadow-sm sm:p-5"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Community</span>
                <span className="text-xs text-ink-soft group-hover:text-ink">Open →</span>
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">{community.members}</p>
              <p className="mt-1 text-xs text-ink-soft">Members enrolled</p>
            </div>
            <div className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">
              {community.active_week} active this week · {community.approved_posts} posts
            </div>
          </Link>

          {/* 2. Courses */}
          <Link
            href="/console/courses"
            className="group flex flex-col justify-between rounded-2xl border border-line bg-paper p-4 transition-all hover:border-ink hover:shadow-sm sm:p-5"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Courses</span>
                <span className="text-xs text-ink-soft group-hover:text-ink">Open →</span>
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">{courses.published_courses}</p>
              <p className="mt-1 text-xs text-ink-soft">Published courses</p>
            </div>
            <div className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">
              {courses.total_enrollments} student enrollments
            </div>
          </Link>

          {/* 3. Tools Directory */}
          <Link
            href="/console/directory"
            className="group flex flex-col justify-between rounded-2xl border border-line bg-paper p-4 transition-all hover:border-ink hover:shadow-sm sm:p-5"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Directory</span>
                <span className="text-xs text-ink-soft group-hover:text-ink">Open →</span>
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">{tools.total}</p>
              <p className="mt-1 text-xs text-ink-soft">Listed tools</p>
            </div>
            <div className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">
              {tools.published} published {tools.pending > 0 ? `· ${tools.pending} pending` : ""}
            </div>
          </Link>

          {/* 4. Free Guides */}
          <Link
            href="/console/lead-magnets"
            className="group flex flex-col justify-between rounded-2xl border border-line bg-paper p-4 transition-all hover:border-ink hover:shadow-sm sm:p-5"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Free Guides</span>
                <span className="text-xs text-ink-soft group-hover:text-ink">Open →</span>
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">{guides.published_guides}</p>
              <p className="mt-1 text-xs text-ink-soft">Active lead magnets</p>
            </div>
            <div className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">
              {guides.total_guides} total guides
            </div>
          </Link>

          {/* 5. Email */}
          <Link
            href="/console/email/cost"
            className="group flex flex-col justify-between rounded-2xl border border-line bg-paper p-4 transition-all hover:border-ink hover:shadow-sm sm:p-5"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Email</span>
                <span className="text-xs text-ink-soft group-hover:text-ink">Open →</span>
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">{emails.sent_30d.toLocaleString()}</p>
              <p className="mt-1 text-xs text-ink-soft">Emails sent (30d)</p>
            </div>
            <div className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">
              Est. ${((emails.sent_30d * 0.1) / 1000).toFixed(2)} SES · {emails.active_flows} flows
            </div>
          </Link>

          {/* 6. WhatsApp */}
          <Link
            href="/console/whatsapp"
            className="group flex flex-col justify-between rounded-2xl border border-line bg-paper p-4 transition-all hover:border-ink hover:shadow-sm sm:p-5"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">WhatsApp</span>
                <span className="text-xs text-ink-soft group-hover:text-ink">Open →</span>
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">{whatsapp.sent.toLocaleString()}</p>
              <p className="mt-1 text-xs text-ink-soft">Messages sent</p>
            </div>
            <div className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">
              {whatsapp.delivered.toLocaleString()} delivered
            </div>
          </Link>

          {/* 7. Meetings */}
          <Link
            href="/console/meetings"
            className="group flex flex-col justify-between rounded-2xl border border-line bg-paper p-4 transition-all hover:border-ink hover:shadow-sm sm:p-5"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Meetings</span>
                <span className="text-xs text-ink-soft group-hover:text-ink">Open →</span>
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">{meetings.total_meetings}</p>
              <p className="mt-1 text-xs text-ink-soft">Booked meetings</p>
            </div>
            <div className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">
              {meetings.upcoming_meetings} upcoming · {meetings.confirmed_meetings} confirmed
            </div>
          </Link>

          {/* 8. Reviews */}
          <Link
            href="/console/reviews"
            className="group flex flex-col justify-between rounded-2xl border border-line bg-paper p-4 transition-all hover:border-ink hover:shadow-sm sm:p-5"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Reviews</span>
                <span className="text-xs text-ink-soft group-hover:text-ink">Open →</span>
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">{reviews.approved_reviews}</p>
              <p className="mt-1 text-xs text-ink-soft">Approved reviews</p>
            </div>
            <div className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">
              {reviews.total_reviews} total {reviews.pending_reviews > 0 ? `· ${reviews.pending_reviews} pending` : ""}
            </div>
          </Link>

          {/* 9. Blogs */}
          <Link
            href="/console/blog"
            className="group flex flex-col justify-between rounded-2xl border border-line bg-paper p-4 transition-all hover:border-ink hover:shadow-sm sm:p-5"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Blog</span>
                <span className="text-xs text-ink-soft group-hover:text-ink">Open →</span>
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">{publishedBlogCount}</p>
              <p className="mt-1 text-xs text-ink-soft">Published articles</p>
            </div>
            <div className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">
              {totalBlogCount} total blog entries
            </div>
          </Link>

          {/* 10. Website Traffic */}
          <Link
            href="/console/analytics"
            className="group flex flex-col justify-between rounded-2xl border border-line bg-paper p-4 transition-all hover:border-ink hover:shadow-sm sm:p-5"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Traffic</span>
                <span className="text-xs text-ink-soft group-hover:text-ink">Open →</span>
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">
                {ga4Sessions !== null ? ga4Sessions.toLocaleString() : "GA4 Live"}
              </p>
              <p className="mt-1 text-xs text-ink-soft">GA4 sessions (28d)</p>
            </div>
            <div className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">
              {"error" in ga4 ? "Click to refresh" : "Google Analytics 4"}
            </div>
          </Link>
        </div>
      </div>

      {/* Recent Sign-ups (Collapsible / Expandable for Privacy) */}
      <ConsoleRecentSignups signups={recentSignupsQuery.rows} />
    </div>
  );
}
