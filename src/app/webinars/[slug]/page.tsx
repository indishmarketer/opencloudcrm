import type { Metadata } from "next";
import SafeImage from "@/components/SafeImage";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import WebinarArtwork from "@/components/WebinarArtwork";
import WebinarRegistrationForm from "@/components/WebinarRegistrationForm";
import WebinarReleaseGate from "@/components/WebinarReleaseGate";
import { getSession } from "@/lib/auth";
import { isConsoleOwner } from "@/lib/consoleAdmins";
import { pool } from "@/lib/db";
import { serializeJsonLd } from "@/lib/jsonLd";
import { canWatchWebinar, type Webinar } from "@/lib/webinars";
import { upcomingWebinarSessions, type WebinarScheduleRule } from "@/lib/webinarSchedule";
import { formatWebinarSessionWindow } from "@/lib/webinarReminders";
import { webinarSessionState } from "@/lib/webinarSession";
import { SITE_NAME, OG_LOCALE } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { getPublishedPage } from "@/lib/sitePages";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ join?: string; session?: string; left?: string }>;
};

async function loadWebinar(slug: string): Promise<Webinar | null> {
  const result = await pool.query<Webinar>("SELECT * FROM webinars WHERE slug = $1 LIMIT 1", [slug]);
  return result.rows[0] || null;
}

/** Falls back to the Mux-derived cover frame when no thumbnail was manually
 * uploaded -- the page itself always shows a real thumbnail this way (see
 * WebinarArtwork.tsx), but metadata/JSON-LD previously only ever used
 * thumbnail_url directly, so any webinar without a manual upload got no
 * social-share image and JSON-LD missing the thumbnailUrl Google requires. */
function resolvedThumbnailUrl(webinar: Webinar): string | null {
  if (webinar.thumbnail_url) return webinar.thumbnail_url;
  if (webinar.mux_playback_id) return `${SITE_URL}/api/webinars/${encodeURIComponent(webinar.mux_playback_id)}/thumbnail`;
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const webinar = await loadWebinar((await params).slug);
  if (!webinar) return {};
  const title = webinar.seo_title || webinar.title;
  const description = webinar.seo_description || webinar.subtitle || webinar.description || undefined;
  const thumbnailUrl = resolvedThumbnailUrl(webinar);
  const images = thumbnailUrl ? [{ url: thumbnailUrl, alt: `${webinar.title} webinar cover` }] : undefined;
  return {
    title,
    description,
    alternates: { canonical: `/webinars/${webinar.slug}` },
    openGraph: { title, description, url: `/webinars/${webinar.slug}`, type: "video.other", siteName: SITE_NAME, locale: OG_LOCALE, images },
    twitter: { card: images ? "summary_large_image" : "summary", title, description, images },
  };
}

function durationLabel(seconds: number | null): string {
  return seconds ? `${Math.max(1, Math.round(seconds / 60))} minutes` : "Private session";
}

export default async function WebinarDetailPage({ params, searchParams }: Props) {
  if (!(await getPublishedPage("/webinars"))) notFound();
  const webinar = await loadWebinar((await params).slug);
  if (!webinar) notFound();
  const session = await getSession();
  const isOwner = Boolean(session?.email && isConsoleOwner(session.email));
  if (webinar.status !== "published" && !isOwner) notFound();

  let hasRegistered = !webinar.requires_registration;
  let hasProAccess = webinar.access_tier !== "pro";
  const scheduleResult = await pool.query<WebinarScheduleRule>("SELECT * FROM webinar_schedules WHERE webinar_id = $1 AND active = true ORDER BY id", [webinar.id]);
  const upcomingSessions = upcomingWebinarSessions(scheduleResult.rows, new Date(), 12, 366, webinar.duration_seconds || 0);
  let registeredSessionStart: string | null = null;
  let registeredTimeZone = "UTC";
  let serverNow = 0;
  if (session) {
    const registration = await pool.query("SELECT session_start_at, attendee_timezone, completed_at, (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS server_now FROM webinar_access WHERE webinar_id = $1 AND user_id = $2 LIMIT 1", [webinar.id, session.userId]);
    hasRegistered = hasRegistered || Boolean(registration.rowCount) || isOwner;
    registeredSessionStart = registration.rows[0]?.session_start_at ? new Date(registration.rows[0].session_start_at).toISOString() : null;
    registeredTimeZone = registration.rows[0]?.attendee_timezone || "UTC";
    serverNow = Number(registration.rows[0]?.server_now || 0);
    if (webinar.access_tier === "pro" && !isOwner) {
      const entitlement = await pool.query(
        `SELECT EXISTS(SELECT 1 FROM course_enrollments WHERE user_id = $1 AND tier = 'pro') AS has_pro_course,
                EXISTS(SELECT 1 FROM community_memberships WHERE user_id = $1 AND status = 'active' AND (current_period_end IS NULL OR current_period_end > now())) AS has_membership`,
        [session.userId],
      );
      hasProAccess = Boolean(entitlement.rows[0]?.has_pro_course || entitlement.rows[0]?.has_membership);
    } else if (isOwner) hasProAccess = true;
  }
  const gate: { allowed: boolean; reason?: string } = canWatchWebinar({ webinar, isOwner, hasRegistered, hasProAccess });
  const query = await searchParams;
  const sessionState = registeredSessionStart && webinar.duration_seconds ? webinarSessionState(registeredSessionStart, webinar.duration_seconds, serverNow) : null;
  const registeredWindow = registeredSessionStart ? formatWebinarSessionWindow(registeredSessionStart, webinar.duration_seconds, registeredTimeZone) : null;
  const sessionEnded = sessionState?.phase === "ended";
  const canRejoinCurrent = Boolean(registeredSessionStart && !sessionEnded);
  if (session && gate.allowed && query.left !== "1" && (isOwner || canRejoinCurrent)) redirect(`/webinars/${webinar.slug}/room`);

  const autoJoin = query.join === "1";
  const related = await pool.query<Webinar>("SELECT * FROM webinars WHERE status = 'published' AND id <> $1 ORDER BY featured DESC, created_at DESC LIMIT 3", [webinar.id]);
  const thumbnailUrl = resolvedThumbnailUrl(webinar);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "@id": `${SITE_URL}/webinars/${webinar.slug}#video`,
    url: `${SITE_URL}/webinars/${webinar.slug}`,
    name: webinar.title,
    description: webinar.seo_description || webinar.subtitle || webinar.description || webinar.title,
    uploadDate: new Date(webinar.created_at).toISOString(),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(webinar.duration_seconds ? { duration: `PT${webinar.duration_seconds}S` } : {}),
    isAccessibleForFree: webinar.access_tier === "free",
    publisher: { "@id": `${SITE_URL}/#organization` },
  };

  return <div className="bg-paper">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <section className="border-b border-line bg-paper-soft"><div className="mx-auto max-w-6xl px-6 py-10 sm:py-16">
      <Link href="/webinars" className="text-sm text-ink-soft hover:text-ink">Back to webinar library</Link>
      <div className="mt-7 grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] lg:items-start">
        <div><div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft"><span>Webinar</span><span aria-hidden="true">•</span><span>{durationLabel(webinar.duration_seconds)}</span><span aria-hidden="true">•</span><span>Live timeline, no replay</span>{webinar.access_tier === "pro" && <span className="rounded-full bg-ink px-2.5 py-1 text-paper">PRO</span>}</div>
          <h1 className="mt-4 max-w-4xl font-display text-4xl font-semibold leading-[1.06] tracking-tight sm:text-5xl lg:text-6xl">{webinar.title}</h1>
          {(webinar.subtitle || webinar.description) && <p className="mt-5 max-w-3xl text-base leading-7 text-ink-soft sm:text-lg">{webinar.subtitle || webinar.description}</p>}
          {webinar.presenter_name && <p className="mt-5 text-sm text-ink-soft">Hosted by <span className="font-semibold text-ink">{webinar.presenter_name}</span>{webinar.presenter_title ? `, ${webinar.presenter_title}` : ""}</p>}
          {registeredWindow && <div className="mt-5 inline-flex rounded-xl border border-line bg-paper px-4 py-3 text-sm"><span><strong>Your broadcast:</strong> {registeredWindow}</span></div>}
          <div className="mt-8"><WebinarArtwork title={webinar.title} thumbnailUrl={webinar.thumbnail_url} playbackId={webinar.mux_playback_id} priority sizes="(max-width: 1024px) 100vw, 58vw" /></div>
        </div>
        <div className="lg:sticky lg:top-28">
          {gate.reason === "release_pending" && webinar.release_at ? <WebinarReleaseGate releaseAt={webinar.release_at} /> : gate.reason === "requires_pro" && session ? <aside className="rounded-3xl border border-line bg-paper p-7"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">PRO webinar</p><h2 className="mt-3 font-display text-2xl font-semibold">Upgrade to enter this room</h2><p className="mt-3 text-sm leading-6 text-ink-soft">Your account is active, but this session is reserved for PRO members.</p><Link href="/courses" className="mt-6 inline-flex w-full justify-center rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper">Explore PRO access</Link></aside> : query.left === "1" && canRejoinCurrent ? <aside className="rounded-3xl border border-line bg-paper p-7"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">You left the room</p><h2 className="mt-3 font-display text-2xl font-semibold">The session is still running</h2><p className="mt-3 text-sm leading-6 text-ink-soft">You can rejoin at the current live point. The presentation continued while you were away.</p><Link href={`/webinars/${webinar.slug}/room`} className="mt-6 inline-flex w-full justify-center rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper">Rejoin live session</Link></aside> : sessionEnded && scheduleResult.rows.length === 0 ? <aside className="rounded-3xl border border-line bg-paper p-7"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">Session ended</p><h2 className="mt-3 font-display text-2xl font-semibold">This webinar has finished</h2><p className="mt-3 text-sm leading-6 text-ink-soft">Your session followed a live timeline and cannot be restarted from the beginning.</p></aside> : scheduleResult.rows.length === 0 || upcomingSessions.length === 0 ? <aside className="rounded-3xl border border-line bg-paper p-7"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">Schedule pending</p><h2 className="mt-3 font-display text-2xl font-semibold">The next session will be announced soon</h2><p className="mt-3 text-sm leading-6 text-ink-soft">Registration opens after the host schedules the next broadcast.</p></aside> : <aside className="rounded-3xl border border-line bg-paper p-6 shadow-[0_20px_60px_rgba(10,10,10,0.08)] sm:p-7"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">Next live broadcast</p><h2 className="mt-3 font-display text-2xl font-semibold">Reserve your webinar seat</h2><p className="mt-3 text-sm leading-6 text-ink-soft">Seats are always reserved for the next broadcast. The presentation runs on a live timeline and cannot be rewound.</p><div className="mt-6"><WebinarRegistrationForm webinarId={webinar.id} webinarSlug={webinar.slug} webinarTitle={webinar.title} signedIn={Boolean(session)} accessTier={webinar.access_tier} autoJoin={autoJoin} upcomingSessions={upcomingSessions} scheduleTimeZone={scheduleResult.rows[0]?.timezone || "Asia/Kolkata"} durationSeconds={webinar.duration_seconds} /></div></aside>}
        </div>
      </div>
    </div></section>

    <div className="mx-auto max-w-6xl px-6 py-14"><div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-12">
        {webinar.key_takeaways.length > 0 && <section><p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">What you will learn</p><h2 className="mt-2 font-display text-3xl font-semibold">What you will leave with</h2><ul className="mt-6 grid gap-3 sm:grid-cols-2">{webinar.key_takeaways.map((item, index) => <li key={`${item}-${index}`} className="flex gap-3 rounded-2xl border border-line p-4 text-sm leading-6"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs text-paper">✓</span><span>{item}</span></li>)}</ul></section>}
        {webinar.agenda.length > 0 && <section><p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">Agenda</p><h2 className="mt-2 font-display text-3xl font-semibold">Inside the session</h2><ol className="mt-6 border-t border-line">{webinar.agenda.map((item, index) => <li key={`${item.title}-${index}`} className="grid gap-3 border-b border-line py-5 sm:grid-cols-[48px_1fr]"><span className="font-display text-xl text-ink-soft">{String(index + 1).padStart(2, "0")}</span><div><h3 className="font-semibold">{item.title}</h3>{item.description && <p className="mt-1 text-sm leading-6 text-ink-soft">{item.description}</p>}</div></li>)}</ol></section>}
        {webinar.description && webinar.description !== webinar.subtitle && <section><h2 className="font-display text-3xl font-semibold">About the webinar</h2><p className="mt-5 whitespace-pre-line text-base leading-8 text-ink-soft">{webinar.description}</p></section>}
      </div>
      <div className="space-y-6">{webinar.audience && <section className="rounded-2xl border border-line p-6"><h2 className="font-display text-xl font-semibold">Who should attend</h2><p className="mt-3 whitespace-pre-line text-sm leading-6 text-ink-soft">{webinar.audience}</p></section>}{webinar.presenter_name && <section className="rounded-2xl border border-line p-6"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">Host</p><div className="mt-4 flex items-center gap-4">{webinar.presenter_image_url ? <div className="relative h-16 w-16 overflow-hidden rounded-full border border-line"><SafeImage src={webinar.presenter_image_url} alt={`${webinar.presenter_name} webinar host`} fill sizes="64px" className="object-cover" /></div> : <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ink font-display text-xl text-paper">{webinar.presenter_name.slice(0, 1).toUpperCase()}</div>}<div><h2 className="font-semibold">{webinar.presenter_name}</h2>{webinar.presenter_title && <p className="mt-1 text-xs text-ink-soft">{webinar.presenter_title}</p>}</div></div>{webinar.presenter_bio && <p className="mt-4 text-sm leading-6 text-ink-soft">{webinar.presenter_bio}</p>}</section>}</div>
    </div>
    {related.rows.length > 0 && <section className="mt-16 border-t border-line pt-12"><h2 className="font-display text-3xl font-semibold">More webinars</h2><div className="mt-6 grid gap-6 md:grid-cols-3">{related.rows.map((item) => <Link key={item.id} href={`/webinars/${item.slug}`} className="group"><WebinarArtwork title={item.title} thumbnailUrl={item.thumbnail_url} playbackId={item.mux_playback_id} sizes="(max-width: 768px) 100vw, 30vw" /><h3 className="mt-3 font-semibold group-hover:underline">{item.title}</h3></Link>)}</div></section>}
    </div>
  </div>;
}
