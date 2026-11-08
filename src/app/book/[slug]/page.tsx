import type { Metadata } from "next";
import SafeImage from "@/components/SafeImage";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { MeetingBookingWidget } from "@/components/MeetingBookingWidget";
import { serializeJsonLd } from "@/lib/jsonLd";
import { calVideoUrl } from "@/lib/calcom";
import { createMeetingManageToken } from "@/lib/meetingManageToken";
import { notFound } from "next/navigation";
import { getDefaultAuthorView } from "@/lib/blogAuthors";
import { getReviewStats } from "@/lib/reviewStats";
import { SITE_NAME, SITE_URL, OG_LOCALE, OG_ASSET_VERSION, assetUrl } from "@/config/brand";

// A fresh install's unconfigured placeholder has no photo -- fall back to
// the sitewide default OG image (same one layout.tsx uses) for
// social-preview metadata only; the in-page host badge omits the photo
// entirely rather than showing a logo as if it were a face.
function hostSocialImage(avatar: string | null): string {
  return avatar || `${assetUrl("brand/og-default.png")}?v=${OG_ASSET_VERSION}`;
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const search = await searchParams;
  const result = await pool.query("SELECT name, description FROM meeting_types WHERE slug = $1 AND active = true", [slug]);
  const meetingType = result.rows[0];
  if (!meetingType) return {};
  const host = await getDefaultAuthorView();
  const hostImage = hostSocialImage(host.avatar);
  return {
    title: `Book: ${meetingType.name}`,
    description: meetingType.description || undefined,
    alternates: { canonical: `/book/${slug}` },
    openGraph: { title: meetingType.name, description: meetingType.description || undefined, url: `/book/${slug}`, siteName: SITE_NAME, locale: OG_LOCALE, images: [{ url: hostImage }] },
    twitter: { card: "summary_large_image", title: meetingType.name, description: meetingType.description || undefined, images: [hostImage] },
    // The post-booking success state (?success=true&bookingId=N) is a
    // private per-booking confirmation, not a page anyone should find
    // through search -- noindex it specifically, while the plain
    // /book/[slug] URL (no query string) stays fully indexable.
    ...(search.success === "true" ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function BookMeetingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const search = await searchParams;
  const bookingConfirmed = search.success === "true";
  const confirmedBookingId = Array.isArray(search.bookingId) ? search.bookingId[0] : search.bookingId;

  const session = await getSession();
  let prefillName = "";
  const prefillEmail = session?.email || "";

  if (session) {
    const result = await pool.query("SELECT name FROM users WHERE id = $1", [session.userId]);
    if (result.rows[0]?.name) {
      prefillName = result.rows[0].name;
    }
  }

  const mtResult = await pool.query("SELECT id, name, description, duration_minutes FROM meeting_types WHERE slug = $1 AND active = true", [slug]);
  const meetingType = mtResult.rows[0];

  if (!meetingType) {
    notFound();
  }

  let joinUrl: string | null = null;
  let manageUrl: string | null = null;
  let icsUrl: string | null = null;
  let googleCalendarUrl: string | null = null;
  if (bookingConfirmed && confirmedBookingId) {
    const bookingResult = await pool.query("SELECT id, calcom_booking_uid, scheduled_start, scheduled_end FROM meeting_bookings WHERE id = $1", [Number(confirmedBookingId)]);
    const row = bookingResult.rows[0];
    if (row) {
      joinUrl = calVideoUrl(row.calcom_booking_uid);
      const manageToken = await createMeetingManageToken(Number(row.id));
      manageUrl = `/book/manage/${manageToken}`;
      icsUrl = `/api/meetings/ics/${manageToken}`;
      const toGoogleDate = (d: string) => new Date(d).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      const googleParams = new URLSearchParams({
        action: "TEMPLATE",
        text: meetingType.name,
        dates: `${toGoogleDate(row.scheduled_start)}/${toGoogleDate(row.scheduled_end)}`,
        details: `Join: ${joinUrl}`,
      });
      googleCalendarUrl = `https://calendar.google.com/calendar/render?${googleParams.toString()}`;
    }
  }

  const reviewStats = await getReviewStats();
  const host = await getDefaultAuthorView();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${SITE_URL}/book/${slug}#service`,
    url: `${SITE_URL}/book/${slug}`,
    name: meetingType.name,
    description: meetingType.description || undefined,
    provider: { "@id": `${SITE_URL}/#organization` },
    potentialAction: {
      "@type": "ReserveAction",
      target: `${SITE_URL}/book/${slug}`,
    },
    ...(reviewStats.totalCount > 0 ? {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: String(reviewStats.averageRating),
        bestRating: "5",
        reviewCount: String(reviewStats.totalCount),
      },
    } : {}),
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <div className="rounded-2xl border border-line bg-paper p-6 shadow-sm">
        <Link href={`/author/${host.slug}`} className="group mb-4 flex items-center gap-3">
          {host.avatar && (
            <SafeImage
              src={host.avatar}
              alt={`${host.name}, host of this call`}
              width={48}
              height={48}
              className="h-12 w-12 rounded-full object-cover"
            />
          )}
          <span className="text-sm font-medium text-ink-soft group-hover:text-ink group-hover:underline">with {host.name}</span>
        </Link>
        <h1 className="mb-2 font-display text-3xl font-semibold">{meetingType.name}</h1>
        {meetingType.description && (
          <p className="mb-4 text-ink-soft">{meetingType.description}</p>
        )}
        <p className="mb-8 text-sm font-medium text-ink-soft">
          {meetingType.duration_minutes} minutes
        </p>

        {bookingConfirmed ? (
          <div className="rounded-xl border border-line bg-paper-soft p-6 text-center">
            <p className="font-display text-xl font-semibold">You&apos;re booked</p>
            <p className="mt-2 text-sm text-ink-soft">
              A confirmation email is on its way with the exact time in your timezone. We&apos;ll also send a
              reminder before the call.
            </p>
            {joinUrl && (
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <a
                  href={joinUrl}
                  className="inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80"
                >
                  Meeting link (active closer to the time)
                </a>
                {manageUrl && (
                  <a
                    href={manageUrl}
                    className="inline-block rounded-full border border-line px-6 py-2.5 text-sm font-medium hover:border-ink"
                  >
                    Reschedule or cancel
                  </a>
                )}
              </div>
            )}
            {(icsUrl || googleCalendarUrl) && (
              <div className="mt-3 flex flex-wrap justify-center gap-3">
                {googleCalendarUrl && (
                  <a href={googleCalendarUrl} target="_blank" rel="noreferrer" className="text-sm text-ink-soft underline hover:text-ink">
                    Add to Google Calendar
                  </a>
                )}
                {icsUrl && (
                  <a href={icsUrl} className="text-sm text-ink-soft underline hover:text-ink">
                    Download .ics (Apple/Outlook)
                  </a>
                )}
              </div>
            )}
          </div>
        ) : (
          <MeetingBookingWidget
            slug={slug}
            prefillName={prefillName}
            prefillEmail={prefillEmail}
          />
        )}
      </div>

      {reviewStats.totalCount > 0 && (
        <Link href="/reviews" className="mt-8 flex items-center justify-center gap-2 text-sm text-ink-soft hover:text-ink hover:underline">
          <span aria-hidden>&#9733;</span>
          {reviewStats.averageRating} from {reviewStats.totalCount} reviews
        </Link>
      )}

      <div className="mt-10 space-y-6">
        <div>
          <h2 className="font-display text-xl font-semibold">What to expect on the call</h2>
          <p className="mt-2 text-sm text-ink-soft">
            This is a short, no-pressure conversation, not a sales pitch. We&apos;ll talk through where things
            stand for you right now, what you&apos;re trying to achieve, and whether working together makes sense.
            If it does, you&apos;ll leave with clear next steps; if it doesn&apos;t, you&apos;ll still leave with
            useful direction.
          </p>
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold">How it works</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
            <li>Pick a time above; availability updates in real time.</li>
            <li>You&apos;ll get an email confirmation with a link that opens right in your browser, no app to install.</li>
            <li>A reminder email goes out before the call so you don&apos;t need to keep track of the time yourself.</li>
          </ul>
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold">Common questions</h2>
          <div className="mt-3 space-y-4">
            <div>
              <p className="text-sm font-medium">Will I be pitched on the call?</p>
              <p className="mt-1 text-sm text-ink-soft">No. It&apos;s a conversation about your situation first. If working together makes sense, we&apos;ll talk about what that looks like; if it doesn&apos;t, you&apos;ll still leave with useful direction.</p>
            </div>
            <div>
              <p className="text-sm font-medium">Do I need to install anything?</p>
              <p className="mt-1 text-sm text-ink-soft">No. The meeting link opens directly in your browser.</p>
            </div>
            <div>
              <p className="text-sm font-medium">Can I change the time after booking?</p>
              <p className="mt-1 text-sm text-ink-soft">Yes, anytime, using the reschedule/cancel link in your confirmation email. No need to email us to move it.</p>
            </div>
            <div>
              <p className="text-sm font-medium">What should I have ready?</p>
              <p className="mt-1 text-sm text-ink-soft">Nothing required. If it&apos;s useful, jot down what you&apos;d like to discuss in the notes field when booking.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
