import type { Metadata } from "next";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import { getPublicPosts } from "@/lib/blogPosts";
import { buildSafe } from "@/lib/db";
import { resolveImage } from "@/lib/images";
import { SITE_NAME, OG_LOCALE, assetUrl } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";
import NewsletterSignupForm from "@/components/NewsletterSignupForm";
import NewsletterSignupDialog from "@/components/NewsletterSignupDialog";

const OG_IMAGE = assetUrl("newsletter/og-newsletter.png");

/** The illustration beside the hero copy. Empty string falls back to the
 * drawn panel below, so the hero always reads as finished.
 *
 * Deliberately a whole URL and not assetUrl("newsletter/..."). assetUrl
 * builds on config/brand's ASSET_DOMAIN, which reads
 * NEXT_PUBLIC_ASSET_DOMAIN -- a build-time value that the image workflow
 * does not pass, so in production it is frozen at the placeholder and
 * assetUrl returns images.example.com. That is a real bug with its own
 * victims (this page's own og:image is pointing there right now) but it
 * belongs to brand.ts, not here, and routing one hero image around it is
 * not the place to change how every asset URL on the site is built. */
const HERO_IMAGE_URL = "https://images.indishmarketer.com/newsletter/32c2c305-10f7-4a33-b37f-51b18883aba9.webp";

export const dynamic = "force-dynamic";

const baseMetadata: Metadata = {
  title: "Newsletter by Indish Marketer",
  description: `One email every Sunday on building your own marketing systems instead of renting them. Marketing, the server under it, and the AI that builds the rest. Free from ${SITE_NAME}.`,
  alternates: { canonical: `${SITE_URL}/newsletter` },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/newsletter`,
    siteName: SITE_NAME,
    locale: OG_LOCALE,
    title: `The ${SITE_NAME} Newsletter`,
    description: "Build it, don't rent it. One email every Sunday, free.",
    images: [{ url: OG_IMAGE, width: 1520, height: 800, alt: `The ${SITE_NAME} newsletter` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `The ${SITE_NAME} Newsletter`,
    description: "Build it, don't rent it. One email every Sunday, free.",
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
    title: "What I actually built",
    description: "The thing I shipped that week, what it costs to run, and what broke on the way.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "The prompts that built it",
    description: "The exact instructions I gave the AI agent. Copy them and run them yourself.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
        <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" strokeWidth="2.5" />
      </svg>
    ),
    title: "A bill you can cut",
    description: "One subscription worth dropping, what replaces it, and what it costs by usage.",
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
    title: "Marketing that still sells",
    description: "Offers, emails and traffic. The part that makes owning the system worth it.",
  },
];

const SOCIAL_PROOF = [
  { stat: "5,000+", label: "Readers" },
  { stat: "Sunday", label: "Every week" },
  { stat: "Free", label: "Always" },
];

export default async function NewsletterPage() {
  const recentPosts = await buildSafe(async () => (await getPublicPosts()).slice(0, 3), []);

  return (
      <div>

        {/* ── HERO ─────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-paper py-10 sm:py-14 lg:py-16">
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
          {/* Two columns from lg up: the pitch on the left, the image on
              the right. Below lg they stack, copy first. Everything in
              the left column is left-aligned, the stats row included, so
              the whole column shares one edge with the headline. */}
          <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
            <div className="text-left">
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-soft">
                The Sunday email
              </p>

              {/* One line at every width. whitespace-nowrap is the
                  guarantee; the clamp is what makes that guarantee
                  affordable, shrinking the type with the viewport
                  instead of letting the line break. The old heading
                  leaned on text-balance, which does not prevent a break,
                  it only evens the two lines out, which is why this read
                  as "Marketing that / actually works" on every screen
                  narrower than about 1100px. The ceiling is set so the
                  longest line still clears the left column at max-w-6xl,
                  and the floor so it clears a 360px phone inside px-6. */}
              <h1 className="mt-4 whitespace-nowrap font-display text-[clamp(1.5rem,3.7vw,2.9rem)] font-semibold leading-tight">
                Build it,{" "}
                <span className="relative inline-block text-accent">
                  don&apos;t rent it
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
                      className="text-accent"
                    />
                  </svg>
                </span>
              </h1>

              <p className="mt-7 max-w-xl text-lg text-ink-soft">
                Join{" "}
                <strong className="font-semibold text-ink">
                  5,000+ founders, marketers and creators
                </strong>{" "}
                who get one email every Sunday about owning your marketing instead of renting it.
                One server in your name, a few API keys you pay for by usage, and an AI agent that
                builds the rest. Free, and you can leave in one click.
              </p>

              {/* Social proof row */}
              <div className="mt-8 flex flex-wrap items-center gap-10">
                {SOCIAL_PROOF.map(({ stat, label }) => (
                  <div key={label}>
                    <p className="font-display text-2xl font-semibold">{stat}</p>
                    <p className="text-xs text-ink-soft">{label}</p>
                  </div>
                ))}
              </div>

              {/* The form itself now lives behind this button, in the same
                  modal shell the blog popup uses. The hero asks for one
                  decision; the two inputs and the bot check only appear
                  once that decision is made. The bottom-of-page CTA still
                  renders the form inline for anyone who read the whole
                  page first. */}
              <div className="mt-9">
                <NewsletterSignupDialog
                  label="Subscribe for free →"
                  title="Get the Sunday email"
                  blurb="One email every Sunday on building the system instead of renting it. Confirm your address and the next issue lands this weekend."
                />
              </div>

              <p className="mt-4 text-xs text-ink-soft">
                We respect your privacy. Unsubscribe with one click, any time.
              </p>
            </div>

            {/* Hero image. Set HERO_IMAGE_URL above to swap the drawn
                panel for a real photograph: the frame, its border and its
                aspect ratio are identical either way, so nothing in the
                layout moves when the image arrives. */}
            <div className="relative w-full lg:order-none">
              {HERO_IMAGE_URL ? (
                // Intrinsic width/height rather than a fixed-ratio box with
                // object-cover. The illustration carries labels right at its
                // left and right edges, and cover would crop whichever side
                // does not match the frame, taking "AI Systems" and "Revenue"
                // with it. Sized from its own 1092x1440 it is never cropped
                // and never letterboxed, and the row below lg keeps its own
                // height instead of being forced to a guessed ratio.
                //
                // No border, fill or shadow either: the artwork is a floating
                // object on its own light ground, so a card drawn around it
                // reads as a box that failed to load rather than as a frame.
                <SafeImage
                  src={HERO_IMAGE_URL}
                  alt="The Indish Marketer newsletter, bringing together AI systems, marketing, automation and revenue"
                  width={1092}
                  height={1440}
                  priority
                  sizes="(min-width: 1024px) 45vw, 100vw"
                  className="mx-auto h-auto w-full max-w-[300px] sm:max-w-[340px] lg:max-w-[345px]"
                />
              ) : (
                <div className="relative aspect-[5/6] w-full overflow-hidden rounded-[28px] border border-line bg-paper-soft shadow-[0_24px_60px_-40px_rgba(15,10,26,0.5)]">
                <div className="absolute inset-0 bg-paper-gradient">
                  <div
                    aria-hidden="true"
                    className="absolute inset-0"
                    style={{
                      backgroundImage:
                        "radial-gradient(circle at 1px 1px, var(--color-line,#e5e7eb) 1px, transparent 0)",
                      backgroundSize: "24px 24px",
                      opacity: 0.6,
                    }}
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-8 text-center">
                    <span className="flex h-20 w-20 items-center justify-center rounded-3xl border border-accent/25 bg-accent-soft text-accent">
                      <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                        <path d="M4 5h16c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V7c0-1.1.9-2 2-2Z" strokeLinejoin="round" />
                        <path d="m2.6 6.4 9.4 6.6 9.4-6.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <p className="font-display text-2xl font-semibold leading-snug">
                      One email.
                      <br />
                      Every Sunday.
                    </p>
                    <p className="max-w-xs text-sm text-ink-soft">
                      Written from a system that runs on one server, a handful of API keys and an
                      AI agent. The same one serving you this page.
                    </p>
                  </div>
                </div>
                </div>
              )}
            </div>
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
                One email, every Sunday
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-ink-soft">
                One thing I built that week, the prompts that built it, and one bill you can stop
                paying. Short enough to read with a coffee, specific enough to copy.
              </p>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {WHAT_YOU_GET.map(({ icon, title, description }) => (
                <div
                  key={title}
                  className="flex flex-col gap-4 rounded-2xl border border-line bg-paper p-6"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/25 bg-accent-soft text-accent">
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
                A taste of what you&apos;ll get in your inbox. Have a look at the latest from the blog.
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
              Join 5,000+ readers, free
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
