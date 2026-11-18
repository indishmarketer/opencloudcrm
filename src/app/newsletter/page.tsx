import type { Metadata } from "next";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import { getPublicPosts } from "@/lib/blogPosts";
import { buildSafe } from "@/lib/db";
import { resolveImage } from "@/lib/images";
import { SITE_NAME, OG_LOCALE, assetUrl } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";
import NewsletterSignupForm from "@/components/NewsletterSignupForm";

const OG_IMAGE = assetUrl("newsletter/og-newsletter.png");

export const dynamic = "force-dynamic";

const baseMetadata: Metadata = {
  title: "Newsletter — Indish Marketer",
  description: `Real marketing insights, no fluff. Join ${SITE_NAME}'s free newsletter and get actionable tips delivered to your inbox every week.`,
  alternates: { canonical: `${SITE_URL}/newsletter` },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/newsletter`,
    siteName: SITE_NAME,
    locale: OG_LOCALE,
    title: `The ${SITE_NAME} Newsletter`,
    description: "Real marketing insights, no fluff. Free, every week.",
    images: [{ url: OG_IMAGE, width: 1520, height: 800, alt: `The ${SITE_NAME} newsletter` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `The ${SITE_NAME} Newsletter`,
    description: "Real marketing insights, no fluff. Free, every week.",
    images: [OG_IMAGE],
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return baseMetadata;
}

const WHAT_YOU_GET = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77A5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Real case studies",
    description: "What actually worked for real Indian businesses — not theory, actual results.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Growth tactics",
    description: "Actionable strategies for growing your audience, email list, and revenue.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
        <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" strokeWidth="2.5" />
      </svg>
    ),
    title: "Tools & resources",
    description: "Hand-picked tools, templates, and resources to save you hours of research.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Community insights",
    description: "Learn from what fellow marketers and creators are doing right now.",
  },
];

const SOCIAL_PROOF = [
  { stat: "5,000+", label: "Subscribers" },
  { stat: "Weekly", label: "Delivery" },
  { stat: "Free", label: "Always" },
];

export default async function NewsletterPage() {
  const recentPosts = await buildSafe(async () => (await getPublicPosts()).slice(0, 3), []);

  return (
      <div>

        {/* ── HERO ─────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-paper py-20 sm:py-28">
          {/* Subtle grid background */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, var(--color-line,#e5e7eb) 1px, transparent 0)",
              backgroundSize: "32px 32px",
              opacity: 0.5,
            }}
          />
          <div className="relative mx-auto max-w-4xl px-6 text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-1.5 text-xs font-medium text-ink-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Free · No spam · Unsubscribe any time
            </div>
            <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl md:text-6xl">
              Marketing that{" "}
              <span className="relative inline-block">
                actually works
                <svg
                  aria-hidden="true"
                  className="absolute -bottom-2 left-0 w-full"
                  viewBox="0 0 200 8"
                  preserveAspectRatio="none"
                  fill="none"
                >
                  <path
                    d="M2 6 C40 2, 80 7, 120 3 S170 1, 198 5"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="text-ink"
                  />
                </svg>
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg text-ink-soft">
              Join{" "}
              <strong className="font-semibold text-ink">5,000+ marketers and creators</strong>{" "}
              who get real insights, proven strategies, and no-fluff advice from Indish Marketer —
              every week, free.
            </p>

            {/* Social proof row */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
              {SOCIAL_PROOF.map(({ stat, label }) => (
                <div key={label} className="text-center">
                  <p className="font-display text-2xl font-semibold">{stat}</p>
                  <p className="text-xs text-ink-soft">{label}</p>
                </div>
              ))}
            </div>

            {/* Sign-up form */}
            <div className="mx-auto mt-10 max-w-md">
              <NewsletterSignupForm />
            </div>

            <p className="mt-4 text-xs text-ink-soft">
              We respect your privacy. Unsubscribe with one click, any time.
            </p>
          </div>
        </section>

        {/* ── WHAT YOU GET ─────────────────────────────────────── */}
        <section className="bg-paper-soft py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-soft">
                What&apos;s inside
              </p>
              <h2 className="mt-2 font-display text-3xl font-semibold">
                Every issue, every week
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-ink-soft">
                Each newsletter is packed with one big idea, one quick tactic, and one tool
                worth knowing — short enough to read in 5 minutes, dense enough to act on.
              </p>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {WHAT_YOU_GET.map(({ icon, title, description }) => (
                <div
                  key={title}
                  className="flex flex-col gap-4 rounded-2xl border border-line bg-paper p-6"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-paper-soft text-ink">
                    {icon}
                  </span>
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-1 text-sm text-ink-soft">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── RECENT ARTICLES ──────────────────────────────────── */}
        {recentPosts.length > 0 && (
          <section className="bg-paper py-20">
            <div className="mx-auto max-w-6xl px-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-ink-soft">
                    From the blog
                  </p>
                  <h2 className="mt-1 font-display text-3xl font-semibold">Recent articles</h2>
                </div>
                <Link
                  href="/blog"
                  className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink"
                >
                  View all posts →
                </Link>
              </div>
              <p className="mt-3 text-ink-soft">
                A taste of what you&apos;ll get in your inbox — explore the latest from the blog.
              </p>
              <div className="mt-10 grid gap-8 md:grid-cols-3">
                {recentPosts.map((post) => {
                  const img = resolveImage(post.feature_image);
                  return (
                    <Link
                      key={post.slug}
                      href={`/blog/${post.slug}`}
                      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-paper"
                    >
                      {img && (
                        <div className="relative aspect-[1200/650] w-full overflow-hidden border-b border-line bg-paper-soft">
                          <SafeImage
                            src={img}
                            alt={post.title}
                            fill
                            sizes="(min-width: 768px) 33vw, 100vw"
                            className="object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        </div>
                      )}
                      <div className="flex flex-1 flex-col gap-2 p-6">
                        <h3 className="font-display text-lg font-semibold leading-snug">
                          {post.title}
                        </h3>
                        <p className="line-clamp-2 text-sm text-ink-soft">{post.excerpt}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ── FINAL CTA ─────────────────────────────────────────── */}
        <section
          id="newsletter-signup"
          className="scroll-mt-24 border-t border-line bg-paper-gradient py-20 text-center"
        >
          <div className="mx-auto max-w-xl px-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-soft">
              Still on the fence?
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold">
              Join 5,000+ readers — it&apos;s free
            </h2>
            <p className="mx-auto mt-3 max-w-sm text-ink-soft">
              No gatekeeping. No premium tier. Just genuine marketing content, delivered to your
              inbox every week.
            </p>
            <div className="mx-auto mt-8 max-w-md text-left">
              <NewsletterSignupForm />
            </div>
          </div>
        </section>

      </div>
  );
}
