import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import WebinarArtwork from "@/components/WebinarArtwork";
import { serializeJsonLd } from "@/lib/jsonLd";
import { listPublishedWebinars } from "@/lib/webinars";
import { buildSafe } from "@/lib/db";
import { SITE_NAME, assetUrl } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { BuiltInPage, builtInPageMetadata } from "@/components/pageBlocks/SitePageView";
import { getPublishedPage } from "@/lib/sitePages";

const OG_IMAGE = assetUrl("brand/og-default.png");

const baseMetadata: Metadata = {
  title: "Webinars",
  description: `Watch on-demand sessions from ${SITE_NAME}, at your own pace.`,
  alternates: { canonical: "/webinars" },
  openGraph: {
    title: `Webinars | ${SITE_NAME}`,
    description: `On-demand sessions from ${SITE_NAME}.`,
    url: "/webinars",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: `Webinars | ${SITE_NAME}`,
    description: `On-demand sessions from ${SITE_NAME}.`,
    images: [OG_IMAGE],
  },
};

function durationLabel(seconds: number | null): string {
  if (!seconds) return "On demand";
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}


export async function generateMetadata(): Promise<Metadata> {
  if (!(await getPublishedPage("/webinars"))) return {};
  return builtInPageMetadata("/webinars", baseMetadata);
}

export default async function WebinarsListingPage() {
  if (!(await getPublishedPage("/webinars"))) notFound();
  // See the build-phase note on buildSafe (src/lib/db.ts).
  const webinars = await buildSafe(listPublishedWebinars, []);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Webinars",
    url: `${SITE_URL}/webinars`,
    description: `On-demand sessions from ${SITE_NAME}.`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: webinars.map((webinar, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${SITE_URL}/webinars/${webinar.slug}`,
        name: webinar.title,
      })),
    },
  };

  return (
    <BuiltInPage path="/webinars">
    <div className="bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />

      <section className="mx-auto max-w-6xl px-6 py-12 sm:py-16" aria-labelledby="webinar-library-heading">
        <div className="flex items-end justify-between gap-6">
          <h2 id="webinar-library-heading" className="font-display text-2xl font-semibold sm:text-3xl sr-only">Webinars</h2>
          {webinars.length > 0 && <p className="text-sm text-ink-soft">{webinars.length} session{webinars.length === 1 ? "" : "s"}</p>}
        </div>

        {webinars.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-dashed border-line px-6 py-16 text-center">
            <p className="font-display text-2xl font-semibold">New sessions are being prepared.</p>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-ink-soft">Check back soon for practical, on-demand training from {SITE_NAME}.</p>
            <Link href="/courses" className="mt-6 inline-flex rounded-full border border-ink px-5 py-2.5 text-sm font-medium transition-colors hover:bg-ink hover:text-paper">Browse courses</Link>
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            {webinars.map((webinar, index) => (
              <article key={webinar.id} className="group grid gap-6 rounded-3xl border border-line bg-paper p-4 transition-colors hover:border-ink/40 sm:p-5 md:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)] md:items-center">
                <Link href={`/webinars/${webinar.slug}`} aria-label={`View ${webinar.title}`} className="block">
                  <WebinarArtwork title={webinar.title} thumbnailUrl={webinar.thumbnail_url} playbackId={webinar.mux_playback_id} priority={index === 0} />
                </Link>
                <div className="px-1 pb-2 md:px-3 md:py-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-ink-soft">
                    <span>{durationLabel(webinar.duration_seconds)}</span>
                    <span aria-hidden="true">•</span>
                    <span>{webinar.access_tier === "pro" ? "PRO session" : "Free session"}</span>
                    {webinar.featured && <span className="rounded-full border border-ink px-2 py-0.5 text-ink">Featured</span>}
                  </div>
                  <h3 className="mt-3 font-display text-2xl font-semibold leading-tight sm:text-3xl">
                    <Link href={`/webinars/${webinar.slug}`} className="underline-offset-4 group-hover:underline">{webinar.title}</Link>
                  </h3>
                  {(webinar.subtitle || webinar.description) && <p className="mt-3 line-clamp-3 max-w-2xl text-sm leading-6 text-ink-soft sm:text-base">{webinar.subtitle || webinar.description}</p>}
                  {webinar.presenter_name && <p className="mt-4 text-sm text-ink-soft">Presented by <span className="font-medium text-ink">{webinar.presenter_name}</span></p>}
                  <Link href={`/webinars/${webinar.slug}`} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-ink">
                    View webinar <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
    </BuiltInPage>
  );
}
