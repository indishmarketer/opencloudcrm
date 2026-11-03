import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getProfileById, isModeratorOrAdmin } from "@/lib/community";
import { isConsoleOwner } from "@/lib/consoleAdmins";
import LogoutButton from "@/components/LogoutButton";
import AccountDangerZone from "@/components/AccountDangerZone";
import AccountCountryForm from "@/components/AccountCountryForm";
import AccountPhoneForm from "@/components/AccountPhoneForm";
import AccountEmailForm from "@/components/AccountEmailForm";
import { accountCountry, accountPhone } from "@/lib/checkoutRegion";
import { initialsOf } from "@/lib/initials";
import { countryName as countryNameOf } from "@/lib/countries";
import { getPublicPosts } from "@/lib/blogPosts";
import { SITE_NAME } from "@/config/brand";

export const metadata = { title: "Your account" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?redirect=/account");

  const resolvedParams = await searchParams;
  const activeTab = (resolvedParams.tab as string) || "courses";

  const [profile, isMod] = await Promise.all([
    getProfileById(session.userId),
    isModeratorOrAdmin(session.userId),
  ]);

  const isOwner = isConsoleOwner(session.email);
  // The header shows who you are on every tab, so these are no longer
  // fetched only when the settings tab is open.
  const [identity, headerCountry, headerPhone] = await Promise.all([
    pool.query<{ name: string | null }>("SELECT name FROM users WHERE id = $1", [session.userId]),
    accountCountry(session.userId),
    accountPhone(session.userId),
  ]);
  const displayName = identity.rows[0]?.name?.trim() || null;
  const countryLabel = headerCountry ? countryNameOf(headerCountry) : null;
  const result = await pool.query(
    `SELECT
      c.slug, c.title, c.cover_image_url,
      COALESCE(ce.tier, 'pro') AS tier,
      COUNT(l.id)::int AS total_lessons,
      COUNT(lp.id)::int AS completed_lessons
    FROM courses c
    LEFT JOIN course_enrollments ce ON ce.course_id = c.id AND ce.user_id = $1
    LEFT JOIN course_modules m ON m.course_id = c.id
    LEFT JOIN course_lessons l ON l.module_id = m.id
    LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = $1
    WHERE ce.id IS NOT NULL OR ($2 AND c.published = true)
    GROUP BY c.id, ce.tier
    ORDER BY c.title`,
    [session.userId, isOwner]
  );

  // The buyer's own payment record (receipts come from Razorpay/PayPal).
  const purchases =
    activeTab === "settings"
      ? (
          await pool.query(
            `SELECT pc.id, pc.method, pc.reference, pc.amount, pc.currency, pc.created_at, pc.refunded_at, pc.refund_amount,
                    c.title, c.slug
             FROM payment_claims pc JOIN courses c ON c.id = pc.course_id
             WHERE pc.user_id = $1 AND pc.status = 'approved' AND pc.amount IS NOT NULL
             ORDER BY pc.created_at DESC`,
            [session.userId],
          )
        ).rows
      : [];
  const listingPayments = activeTab === "settings"
    ? (
        await pool.query(
          `SELECT id, name, paid_amount_cents, paid_currency, paid_at, payment_reference
           FROM directory_tools
           WHERE submitted_by_user_id = $1 AND paid_at IS NOT NULL
           ORDER BY paid_at DESC`,
          [session.userId],
        )
      ).rows
    : [];
  const toolCount = (
    await pool.query("SELECT count(*)::int AS n FROM directory_tools WHERE submitted_by_user_id = $1", [session.userId])
  ).rows[0].n as number;
  // Counts for the My stuff hub. Each is cheap and they run together, so
  // the hub can show a real number or a real empty state rather than
  // hiding a section that happens to be empty, which is what made it
  // impossible to tell "you have none" from "this does not exist".
  const [postCount, meetingCount, authorRow] = await Promise.all([
    pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM forum_posts WHERE user_id = $1",
      [session.userId],
    ),
    pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM meeting_bookings WHERE user_id = $1 OR lower(attendee_email) = lower($2)",
      [session.userId, session.email],
    ),
    pool.query<{ slug: string }>(
      `SELECT ba.slug FROM blog_authors ba
       LEFT JOIN author_applications aa ON (aa.blog_author_id = ba.id OR ba.application_id = aa.id)
       WHERE (aa.user_id = $1 OR ($2 AND ba.slug = 'shubho-dey')) AND ba.is_active = true
       LIMIT 1`,
      [session.userId, isOwner],
    ),
  ]);
  const myPosts = postCount.rows[0]?.n ?? 0;
  const myMeetings = meetingCount.rows[0]?.n ?? 0;
  const authorSlug = authorRow.rows[0]?.slug ?? null;
  const myBlogPosts = authorSlug
    ? (await getPublicPosts()).filter((post) => post.author === authorSlug).length
    : 0;
  const savedCountry = await accountCountry(session.userId);
  const savedPhone = await accountPhone(session.userId);
  const phoneVerified = (
    await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM contacts WHERE phone_verified_at IS NOT NULL AND phone = $3 AND (user_id = $1 OR lower(email) = lower($2))",
      [session.userId, session.email, savedPhone],
    )
  ).rows[0].n > 0;
  const money = (amount: unknown, currency: string) =>
    currency === "INR"
      ? `₹${Number(amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
      : `${currency === "USD" ? "$" : `${currency} `}${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {/* Initials, not a photo. The owner did not want uploads here, and
              a name reduced to its initials is recognisable without one. */}
          <span
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-line bg-paper-soft font-display text-lg font-semibold text-ink"
          >
            {initialsOf(displayName || session.email)}
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-semibold sm:text-3xl">
              {displayName || "Your account"}
            </h1>
            <p className="mt-1 truncate text-sm text-ink-soft">{session.email}</p>
            <p className="mt-0.5 truncate text-sm text-ink-soft">
              {[headerPhone, countryLabel].filter(Boolean).join(" · ") || (
                <Link href="/account?tab=settings" className="underline underline-offset-2">
                  Add your phone and country
                </Link>
              )}
            </p>
          </div>
        </div>
        <LogoutButton />
      </div>

      <div className="mt-10 flex gap-6 overflow-x-auto border-b border-line">
        <Link
          href="/account"
          className={`pb-3 text-sm font-medium transition-colors ${activeTab === "settings" ? "text-ink-soft hover:text-ink" : "border-b-2 border-ink text-ink"}`}
        >
          My stuff
        </Link>
        <Link
          href="/account?tab=settings"
          className={`pb-3 text-sm font-medium transition-colors ${activeTab === "settings" ? "border-b-2 border-ink text-ink" : "text-ink-soft hover:text-ink"}`}
        >
          Settings &amp; billing
        </Link>
      </div>

      <div className="mt-10">
        {activeTab !== "settings" && activeTab !== "community" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-line bg-paper-soft p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">My Courses</h3>
                  <p className="mt-1 text-sm text-ink-soft">
                    {result.rows.length === 0
                      ? "You are not enrolled in any courses yet."
                      : `${result.rows.length} course${result.rows.length === 1 ? "" : "s"} enrolled`}
                  </p>
                </div>
                <Link
                  href="/courses"
                  className="shrink-0 whitespace-nowrap rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink hover:bg-paper"
                >
                  Browse all
                </Link>
              </div>

              {result.rows.length > 0 && (
                <div className="mt-5 space-y-3">
                  {result.rows.map((c) => {
                    const pct = c.total_lessons > 0 ? Math.round((c.completed_lessons / c.total_lessons) * 100) : 0;
                    return (
                      <Link
                        key={c.slug}
                        href={`/account/courses/${c.slug}`}
                        className="block rounded-xl border border-line bg-paper p-4 transition-colors hover:border-ink"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">{c.title}</p>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              c.tier === "pro" ? "bg-ink text-paper" : "bg-paper-soft text-ink-soft"
                            }`}
                          >
                            {c.tier === "pro" ? "PRO" : "Free"}
                          </span>
                        </div>
                        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-paper-soft">
                          <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-1.5 text-xs text-ink-soft">
                          {c.completed_lessons}/{c.total_lessons} lessons completed ({pct}%)
                        </p>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-line bg-paper-soft p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">Community</h3>
                  <p className="mt-1 text-sm text-ink-soft">
                    {profile?.username ? `@${profile.username} · ` : ""}{profile?.community_points ?? 0} points
                    {myPosts > 0 ? ` · ${myPosts} discussion post${myPosts === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <Link
                  href="/community/general"
                  className="shrink-0 whitespace-nowrap rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink hover:bg-paper"
                >
                  Open community
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-paper-soft p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">Directory Tools</h3>
                  <p className="mt-1 text-sm text-ink-soft">
                    {toolCount === 0
                      ? `Submit and feature your tool in the ${SITE_NAME} directory.`
                      : `${toolCount} submitted listing${toolCount === 1 ? "" : "s"}`}
                  </p>
                </div>
                <Link
                  href={toolCount > 0 ? "/account/tools" : "/tools/submit"}
                  className="shrink-0 whitespace-nowrap rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink hover:bg-paper"
                >
                  {toolCount > 0 ? "Manage tools" : "Submit a tool"}
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-paper-soft p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">Guest Writing</h3>
                  <p className="mt-1 text-sm text-ink-soft">
                    {authorSlug
                      ? `Author profile active (${myBlogPosts} article${myBlogPosts === 1 ? "" : "s"})`
                      : `Write and share your insights on the ${SITE_NAME} blog.`}
                  </p>
                </div>
                <Link
                  href={authorSlug ? `/author/${authorSlug}` : "/apply-to-write"}
                  className="shrink-0 whitespace-nowrap rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink hover:bg-paper"
                >
                  {authorSlug ? "View articles" : "Apply to write"}
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-paper-soft p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">Meetings</h3>
                  <p className="mt-1 text-sm text-ink-soft">
                    {myMeetings === 0
                      ? "Book a 1-on-1 strategy or discovery call."
                      : `${myMeetings} booked meeting${myMeetings === 1 ? "" : "s"}`}
                  </p>
                </div>
                <Link
                  href="/book/discovery-call"
                  className="shrink-0 whitespace-nowrap rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink hover:bg-paper"
                >
                  Book a call
                </Link>
              </div>
            </div>
          </div>
        )}

        {activeTab === "community" && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-paper-soft p-6">
            <div>
              <p className="text-sm font-medium">
                Community profile{profile?.username ? `: @${profile.username}` : " not set up yet"}
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                {isMod ? "Moderator" : "Member"} · {profile?.community_points ?? 0} points
              </p>
            </div>
            <Link
              href="/community/settings"
              className="ml-auto rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-ink hover:bg-paper"
            >
              Edit community profile
            </Link>
            {isMod && (
              <Link
                href="/community/admin"
                className="rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-ink hover:bg-paper"
              >
                Community admin
              </Link>
            )}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-line bg-paper-soft p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">Password</h3>
                  <p className="mt-1 text-sm text-ink-soft">
                    Manage your login password and account security.
                  </p>
                </div>
                <Link
                  href="/reset-password"
                  className="shrink-0 whitespace-nowrap rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink hover:bg-paper"
                >
                  Change password
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-paper-soft p-6">
              <h3 className="font-medium">Email</h3>
              <div className="mt-3">
                <AccountEmailForm currentEmail={session.email} />
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-paper-soft p-6">
              <h3 className="font-medium">Country</h3>
              <p className="mt-1 text-xs text-ink-soft">
                Sets your currency at checkout and phone country code.
              </p>
              <div className="mt-3">
                <AccountCountryForm initialCountry={savedCountry} />
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-paper-soft p-6">
              <h3 className="font-medium">Phone</h3>
              <div className="mt-3">
                <AccountPhoneForm initialPhone={savedPhone} country={savedCountry} verified={phoneVerified} />
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-paper-soft p-6">
              <h3 className="font-medium">Purchases</h3>
              {purchases.length === 0 ? (
                <p className="mt-1 text-sm text-ink-soft">No purchases yet.</p>
              ) : (
                <ul className="mt-4 divide-y divide-line">
                  {purchases.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                      <div className="min-w-0">
                        <Link href={`/account/courses/${p.slug}`} className="font-medium hover:underline">
                          {p.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {new Date(p.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          {" · "}
                          {p.method === "razorpay" ? "Razorpay" : p.method === "paypal" ? "PayPal" : "Manual"}
                          {p.reference ? <span className="break-all"> · Ref {p.reference}</span> : null}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{money(p.amount, p.currency)}</p>
                        {p.refunded_at && (
                          <p className="text-xs text-red-600">
                            Refunded{p.refund_amount ? ` ${money(p.refund_amount, p.currency)}` : ""}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {listingPayments.length > 0 && (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="text-sm font-medium">Directory listings</p>
                  <ul className="mt-2 divide-y divide-line">
                    {listingPayments.map((listing) => (
                      <li key={listing.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium">{listing.name} directory listing</p>
                          <p className="mt-0.5 break-all text-xs text-ink-soft">
                            {new Date(listing.paid_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            {listing.payment_reference ? ` · Ref ${listing.payment_reference}` : ""}
                          </p>
                        </div>
                        <p className="font-medium">
                          {listing.paid_currency === "INR"
                            ? `₹${(Number(listing.paid_amount_cents) / 100).toLocaleString("en-IN")}`
                            : `$${(Number(listing.paid_amount_cents) / 100).toFixed(2)}`}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-line bg-paper-soft p-6">
              <h3 className="font-medium">Support & Invoices</h3>
              <p className="mt-1 text-sm text-ink-soft">
                Need help with a purchase or want to request an invoice?
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/contact"
                  className="rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-ink hover:bg-paper"
                >
                  Contact Support
                </Link>
              </div>
            </div>

            <AccountDangerZone />
          </div>
        )}
      </div>
    </div>
  );
}
