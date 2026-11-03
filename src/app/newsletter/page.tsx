import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import NewsletterSignupForm from "@/components/NewsletterSignupForm";
import { getPublicPosts } from "@/lib/blogPosts";
import { resolveImage } from "@/lib/images";
import { SITE_NAME, SITE_URL, OG_LOCALE, assetUrl } from "@/config/brand";
import { BuiltInPage, builtInPageMetadata } from "@/components/pageBlocks/SitePageView";

const OG_IMAGE = assetUrl("newsletter/og-newsletter.png");

const baseMetadata: Metadata = {
  title: "Newsletter",
  description:
    "Practical AI insights for marketers and business owners: tools, automation, programming tips, and making money online, straight to your inbox. Free, no spam.",
  alternates: { canonical: `${SITE_URL}/newsletter` },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/newsletter`,
    siteName: SITE_NAME,
    locale: OG_LOCALE,
    title: `The ${SITE_NAME} Newsletter`,
    description: "AI tools, automation, and programming tips. Free, every week.",
    images: [{ url: OG_IMAGE, width: 1520, height: 800, alt: `The ${SITE_NAME} newsletter` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `The ${SITE_NAME} Newsletter`,
    description: "AI tools, automation, and programming tips. Free, every week.",
    images: [OG_IMAGE],
  },
};

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      <path d="M14 3v5h5M9 13h6M9 17h6" strokeLinecap="round" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 20c.8-3.2 3.2-5 6-5s5.2 1.8 6 5M15.5 20c.4-1.7 1.5-3.1 3-3.9" strokeLinecap="round" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M4 7l8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" strokeLinecap="round" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <path d="M9 8 4 12l5 4M15 8l5 4-5 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <path d="M4 20V10M11 20V4M18 20v-7" strokeLinecap="round" />
    </svg>
  );
}

function LaptopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <rect x="4" y="4" width="16" height="11" rx="1.5" />
      <path d="M2 19h20" strokeLinecap="round" />
    </svg>
  );
}

const benefits = [
  { icon: DocumentIcon, title: "Actionable tips", desc: "No fluff. Just practical insights you can use." },
  { icon: BoltIcon, title: "Save time", desc: "The best tools, workflows, and strategies, curated for you." },
  { icon: PeopleIcon, title: "Built from real work", desc: "Every issue comes from our actual client automations, not theory." },
  { icon: MailIcon, title: "Completely free", desc: "No spam. Unsubscribe anytime." },
];

const topics = [
  {
    icon: ChipIcon,
    title: "AI Agents & Automation",
    desc: "Discover the workflows and agents that actually save you time.",
    href: "/blog/category/ai-automation",
  },
  {
    icon: CodeIcon,
    title: "Tool & App Reviews",
    desc: "Honest reviews of the tools worth paying for, and which ones aren't.",
    href: "/blog/category/tool-reviews",
  },
  {
    icon: ChartIcon,
    title: "Make Money Online",
    desc: "Real income ideas and systems, not get-rich-quick promises.",
    href: "/blog/category/make-money-online",
  },
  {
    icon: LaptopIcon,
    title: "GoHighLevel & CRM",
    desc: "Practical setups and automations inside the tools you already run.",
    href: "/blog/category/gohighlevel-crm",
  },
];


export async function generateMetadata(): Promise<Metadata> {
  return builtInPageMetadata("/newsletter", baseMetadata);
}

export default async function NewsletterPage() {
  const recentPosts = (await getPublicPosts()).slice(0, 3);
  return (
    <BuiltInPage path="/newsletter">
    <div>
      {/* HERO */}
      <section className="bg-ink-gradient text-paper">
        <div className="mx-auto grid max-w-6xl items-center gap-16 px-6 py-24 md:grid-cols-2 md:py-28">
          <div className="flex flex-col gap-6">
            <span className="w-fit rounded-full border border-white/20 px-4 py-1 text-xs font-medium uppercase tracking-widest text-white/70">
              Newsletter
            </span>
            <h1 className="text-balance font-display text-4xl font-semibold leading-tight md:text-5xl">
              Practical AI insights in your inbox
            </h1>
            <p className="max-w-lg text-lg text-white/70">
              Join marketers and business owners who get simple, actionable insights on AI
              tools, automation, programming, and making money online, every week.
            </p>
            <Link
              href="#newsletter-signup"
              className="mt-2 w-fit rounded-full border border-paper bg-paper px-7 py-3 text-sm font-semibold text-ink transition-colors hover:bg-transparent hover:text-paper"
            >
              Subscribe Free
            </Link>
          </div>
          <div className="relative mx-auto mt-6 aspect-[900/760] w-full max-w-md md:mt-0">
            <Image
              src={assetUrl("newsletter/newsletter-hero-v2.png")}
              alt="An illustration of an open envelope with a newsletter card inside, with callouts for AI tools and tutorials, make money online, programming tips, and productivity and growth"
              fill
              sizes="440px"
              className="object-contain"
              priority
            />
          </div>
        </div>
      </section>

      {/* BENEFITS */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((b) => (
            <div key={b.title} className="flex flex-col items-center text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-paper-soft text-ink">
                <b.icon />
              </span>
              <h3 className="mt-4 font-display text-base font-semibold">{b.title}</h3>
              <p className="mt-1 text-sm leading-6 text-ink-soft">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TOPICS WE COVER */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink-soft">What you&apos;ll get</p>
        <h2 className="mt-2 font-display text-3xl font-semibold">Topics we cover</h2>
        <p className="mx-auto mt-3 max-w-xl text-ink-soft">
          Practical tips, tutorials, and real strategies to help you learn, build, and grow with AI.
        </p>
        <div className="mt-10 grid gap-6 text-left sm:grid-cols-2 lg:grid-cols-4">
          {topics.map((t) => (
            <Link
              key={t.title}
              href={t.href}
              className="group rounded-2xl border border-line bg-paper p-6 transition-colors hover:border-ink/40 hover:bg-paper-soft"
            >
              <span className="text-ink">
                <t.icon />
              </span>
              <h3 className="mt-4 font-display text-base font-semibold group-hover:underline">{t.title}</h3>
              <p className="mt-2 text-sm leading-6 text-ink-soft">{t.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* RECENT ARTICLES */}
      <section className="bg-paper-soft py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-soft">Latest from the blog</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-3xl font-semibold">Recent articles</h2>
            <Link
              href="/blog"
              className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink"
            >
              View all posts →
            </Link>
          </div>
          <p className="mt-3 text-ink-soft">Not ready to subscribe? Check out some of the latest posts from the blog.</p>
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
                      <Image
                        src={img}
                        alt={post.title}
                        fill
                        sizes="(min-width: 768px) 33vw, 100vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-2 p-6">
                    <h3 className="font-display text-lg font-semibold leading-snug">{post.title}</h3>
                    <p className="line-clamp-2 text-sm text-ink-soft">{post.excerpt}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section id="newsletter-signup" className="scroll-mt-24 border-t border-line bg-paper-gradient py-20 text-center">
        <div className="mx-auto max-w-xl px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-soft">Join the newsletter</p>
          <h2 className="mt-2 font-display text-3xl font-semibold">Let&apos;s build and grow together</h2>
          <p className="mt-3 text-ink-soft">Get one useful email when there&apos;s something real to share.</p>
          <div className="mx-auto mt-8 max-w-md text-left">
            <NewsletterSignupForm source="newsletter-final-cta" stacked />
          </div>
        </div>
      </section>
    </div>
    </BuiltInPage>
  );
}
