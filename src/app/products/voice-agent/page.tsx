import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getPublicPosts } from "@/lib/blogPosts";
import { getBlogCategories } from "@/lib/blogCategories";
import VoiceAgentBusinessForm from "@/components/VoiceAgentBusinessForm";
import { serializeJsonLd } from "@/lib/jsonLd";
import { SITE_NAME, OG_LOCALE, SITE_URL, assetUrl } from "@/config/brand";
import { FEATURES } from "@/config/features";

const canonicalUrl = `${SITE_URL}/products/voice-agent`;

export const metadata: Metadata = {
  title: "AI Voice Agent for Business",
  description:
    "Try a conversational AI voice agent built for natural business calls. Create an account, add four business details, and start with a free five-minute demo.",
  alternates: { canonical: canonicalUrl },
  openGraph: {
    title: `AI Voice Agent for Business | ${SITE_NAME}`,
    description:
      "A natural, interruption-friendly AI voice agent for business conversations. Try five minutes free.",
    url: canonicalUrl,
    type: "website",
    siteName: SITE_NAME,
    locale: OG_LOCALE,
    images: [
      {
        url: assetUrl("2026/08/voice-agent-thumb-waveform.webp"),
        width: 1200,
        height: 650,
        alt: "AI Voice Agent title above layered white waveform lines on a black background",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `AI Voice Agent for Business | ${SITE_NAME}`,
    description:
      "A natural, interruption-friendly AI voice agent for business conversations. Try five minutes free.",
    images: [assetUrl("2026/08/voice-agent-thumb-waveform.webp")],
  },
};

const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: `${SITE_NAME} Voice Agent`,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: canonicalUrl,
  description:
    "A browser-based conversational AI voice agent for natural business calls, with a free five-minute demo.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free five-minute voice-agent demo",
  },
  provider: {
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
  },
  featureList: [
    "Natural voice conversations",
    "Interruption-aware turn taking",
    "Business-aware demo setup",
    "Browser-based calling",
  ],
};

const features = [
  {
    eyebrow: "Listen",
    title: "A conversation, not a voice menu",
    copy: "The agent follows live speech and handles the back-and-forth rhythm people expect on a call.",
  },
  {
    eyebrow: "Respond",
    title: "Designed for natural interruptions",
    copy: "Callers can change direction or speak up without waiting for a rigid script to finish.",
  },
  {
    eyebrow: "Adapt",
    title: "Grounded in your business",
    copy: "A short profile gives the demo useful context without sending you through a long application.",
  },
];

export default async function VoiceAgentPage() {
  const [postsIndex, blogCategories] = await Promise.all([getPublicPosts(), getBlogCategories()]);
  return (
    <main className="bg-paper text-ink">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(softwareApplicationSchema) }}
      />

      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-20 sm:py-28 lg:grid-cols-[1.08fr_0.92fr] lg:py-32">
          <div>
            <p className="inline-flex rounded-full border border-line bg-paper-soft px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-ink-soft">
              AI voice agent · five minutes free
            </p>
            <h1 className="mt-7 max-w-3xl text-5xl font-semibold leading-[0.98] tracking-[-0.05em] sm:text-7xl">
              Calls that feel less like a bot.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-ink-soft sm:text-xl">
              Give prospects a natural first conversation. The {SITE_NAME}
              Voice Agent listens, responds, and adapts to your business without
              forcing callers through a phone tree.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="#try-free"
                className="rounded-full bg-ink px-7 py-3.5 text-sm font-semibold text-paper transition hover:bg-ink/85"
              >
                Try five minutes free
              </Link>
              <Link
                href="#how-it-works"
                className="rounded-full border border-line px-7 py-3.5 text-sm font-semibold transition hover:border-ink"
              >
                See how it works
              </Link>
            </div>
            <p className="mt-4 text-sm text-ink-soft">
              No card · browser based · four-field setup
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-lg">
            <div className="overflow-hidden rounded-[2rem] border border-line">
              <Image
                src={assetUrl("2026/08/voice-agent-hero-v2.webp")}
                alt={`${SITE_NAME} founder wearing a headset microphone, representing the AI voice agent answering a live call`}
                width={900}
                height={1100}
                priority
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="bg-paper-soft py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink-soft">
              How it works
            </p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Built around the flow of a real call.
            </h2>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-[2rem] border border-line bg-line md:grid-cols-3">
            {features.map((feature, index) => (
              <article key={feature.title} className="bg-paper p-8 sm:p-10">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">
                    {feature.eyebrow}
                  </p>
                  <span className="text-sm text-ink-soft">0{index + 1}</span>
                </div>
                <h3 className="mt-12 text-2xl font-semibold tracking-tight">
                  {feature.title}
                </h3>
                <p className="mt-4 leading-7 text-ink-soft">{feature.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-line py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink-soft">
              Useful from day one
            </p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">
              One voice. More ways to help.
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {[
              ["First enquiries", "Give new prospects a clear, helpful first conversation."],
              ["Early discovery", "Explore what a prospect needs in a natural first conversation."],
              ["Customer questions", "Guide common conversations without making them feel mechanical."],
              ["After-hours calls", "Let people explain what they need when your team is away."],
            ].map(([title, copy]) => (
              <div key={title} className="rounded-2xl border border-line p-6">
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-soft">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="try-free" className="scroll-mt-24 bg-paper-soft py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-10 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink-soft">
              Try it yourself
            </p>
            <h2 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Start with your business, not a generic script.
            </h2>
          </div>
          {FEATURES.voiceAgent ? (
            <VoiceAgentBusinessForm />
          ) : (
            <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-line bg-paper p-8 text-center">
              <p className="font-medium">The live demo isn&apos;t turned on for this deployment yet.</p>
              <p className="mt-2 text-sm text-ink-soft">Check back soon, or get in touch to ask about it.</p>
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-line py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink-soft">From the blog</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Learn how businesses are using voice AI</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {postsIndex
              .filter(p => p.title.toLowerCase().includes("voice") || p.slug.includes("voice") || p.slug.includes("retell") || p.category === "ai-automation")
              .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
              .slice(0, 3)
              .map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group rounded-2xl border border-line p-6 transition-colors hover:border-ink/40 hover:bg-paper-soft"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  {blogCategories.find(c => c.slug === post.category)?.name || "Blog"}
                </p>
                <h3 className="mt-2 font-display text-base font-semibold leading-snug group-hover:underline">{post.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-soft line-clamp-3">{post.excerpt}</p>
              </Link>
            ))}
          </div>
          <div className="mt-12 flex flex-wrap gap-4">
            <Link
              href="/reviews"
              className="rounded-full border border-line px-6 py-3 text-sm font-semibold transition hover:border-ink"
            >
              Read customer reviews
            </Link>
            <Link
              href="/services"
              className="rounded-full border border-line px-6 py-3 text-sm font-semibold transition hover:border-ink"
            >
              Want a custom AI agent build? →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
