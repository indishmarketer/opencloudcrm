import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { pool, buildSafe } from "@/lib/db";
import { serializeJsonLd } from "@/lib/jsonLd";
import { SITE_NAME, SITE_URL, OG_LOCALE, assetUrl } from "@/config/brand";

const HERO_IMAGE = assetUrl("2026/09/prompt-library-hero.webp");

const CATEGORY_META: Record<string, { image: string; blurb: string }> = {
  images: {
    image: assetUrl("2026/09/prompt-library-category-images-v2.webp"),
    blurb: "Product shots, portraits, illustrations, and brand visuals for AI image generators.",
  },
  videos: {
    image: assetUrl("2026/09/prompt-library-category-video-v2.webp"),
    blurb: "Shot lists, camera moves, and full-scene prompts for AI video generators.",
  },
  agents: {
    image: assetUrl("2026/09/prompt-library-category-agents-v2.webp"),
    blurb: "System prompts and reusable skills for AI agents and assistants you build for your business.",
  },
  coding: {
    image: assetUrl("2026/09/prompt-library-category-coding-v2.webp"),
    blurb: "Prompts and downloadable coding-agent skills for building and debugging real software.",
  },
  marketing: {
    image: assetUrl("2026/09/prompt-library-category-marketing-v2.webp"),
    blurb: "Copywriting, campaign, and outreach prompts for everyday marketing work.",
  },
  automation: {
    image: assetUrl("2026/09/prompt-library-category-automation-v2.webp"),
    blurb: "Workflow and no-code automation prompts and skills for connecting your tools together.",
  },
};

export const metadata: Metadata = {
  title: "Free Prompt & Skill Library",
  description:
    "A free, public library of tested AI prompts and downloadable agent skills for images, video, agents, coding, and marketing. Search by category, then copy or download what you need, no login required.",
  alternates: { canonical: "/resources/prompt-skill-library" },
  openGraph: {
    title: "Free Prompt & Skill Library",
    description: "A free, public library of tested AI prompts and downloadable agent skills. Search by category and copy or download what you need.",
    url: "/resources/prompt-skill-library",
    siteName: SITE_NAME,
    locale: OG_LOCALE,
    images: [HERO_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Prompt & Skill Library",
    description: "A free, public library of tested AI prompts and downloadable agent skills.",
    images: [HERO_IMAGE],
  },
};

export const revalidate = 300;

const FAQS = [
  {
    q: "Is the prompt and skill library actually free?",
    a: "Yes, and it's fully public, no account or login required to browse, copy, or download anything.",
  },
  {
    q: "What's the difference between a prompt and a skill?",
    a: "A prompt is a single block of text you paste into an AI tool to get one result. A skill is a downloadable markdown file that gives an AI agent a repeatable set of instructions for a whole task, the same idea as a SKILL.md file, meant to be reused across many runs, not just pasted once.",
  },
  {
    q: "What's a guide?",
    a: "A guide is a dedicated page built around one specific video or post, an embedded video, an explanation, and a step-by-step list of exactly which prompts or skills to use and when. Guides have their own tab in the library alongside Prompts and Skills.",
  },
  {
    q: "Do I need to log in?",
    a: "No. The whole library, browsing, search, copying, and downloading, is public. Creating a free account is only useful if you also want courses, community, or our newsletter, not required for the library itself.",
  },
  {
    q: "How often is the library updated?",
    a: "We add prompts and skills as we test and use them ourselves in client work, so the library grows over time rather than launching complete. If a category is thin today, check back, it won't stay that way.",
  },
  {
    q: "Can I request a specific type of prompt or skill?",
    a: "Yes, reach out through the contact page. We prioritize real, common use cases over generic filler.",
  },
];

export default async function PromptSkillLibraryLandingPage() {
  // See the build-phase note on buildSafe (src/lib/db.ts).
  const categoryRows = await buildSafe(
    async () =>
      (
        await pool.query(
          `SELECT c.slug, c.name, c.description,
            COUNT(DISTINCT p.id)::int AS prompt_count,
            COUNT(DISTINCT s.id)::int AS skill_count
     FROM prompt_categories c
     LEFT JOIN prompts p ON p.category_id = c.id AND p.status = 'published' AND p.show_in_library = true
     LEFT JOIN skills s ON s.category_id = c.id AND s.status = 'published' AND s.show_in_library = true
     GROUP BY c.id
     ORDER BY c.sort_order ASC`
        )
      ).rows,
    []
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Free Prompt & Skill Library",
    url: `${SITE_URL}/resources/prompt-skill-library`,
    description: "A free, public library of tested AI prompts and downloadable agent skills.",
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <div className="bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqJsonLd) }} />

      <section className="mx-auto max-w-6xl px-6 pt-20">
        <div className="grid gap-12 md:grid-cols-[1.05fr_1fr] md:items-center">
          <div>
            <span className="rounded-full border border-ink/15 bg-paper-soft px-3 py-1 text-xs font-medium text-ink-soft">
              Free Resources
            </span>
            <h1 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">Prompt &amp; Skill Library</h1>
            <p className="mt-6 max-w-xl text-lg leading-7 text-ink-soft">
              A free, public library of prompts and downloadable agent skills we actually use in
              our own AI work, organized by category so you can find what you need in seconds
              instead of hunting through old chat threads or a messy notes doc.
            </p>
            <p className="mt-4 max-w-xl leading-7 text-ink-soft">
              Copy a prompt, or download a skill file straight into your agent&apos;s skills folder.
              No login, no course, nothing to sign up for.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/resources/prompt-skill-library/browse"
                className="inline-flex rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80"
              >
                Open the Library
              </Link>
            </div>
          </div>
          <div className="relative mx-auto aspect-[900/680] w-full overflow-hidden rounded-3xl">
            <Image
              src={HERO_IMAGE}
              alt="Three stacked cards labeled Images, Video, and Agents, representing the library's categories"
              fill
              sizes="(min-width: 768px) 420px, 90vw"
              className="object-cover"
              priority
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pt-20">
        <h2 className="font-display text-2xl font-semibold sm:text-3xl">What&apos;s inside</h2>
        <p className="mt-3 max-w-2xl text-ink-soft">
          Every prompt and skill is filed under one shared set of categories. The library has
          three separate tabs, Prompts, Skills, and Guides, each searchable and filterable by
          category on its own.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {categoryRows.map((c) => {
            const meta = CATEGORY_META[c.slug];
            return (
              <div key={c.slug} className="overflow-hidden rounded-2xl border border-line">
                {meta && (
                  <div className="relative aspect-[4/3] w-full">
                    <Image
                      src={meta.image}
                      alt={`Icon representing the ${c.name} category`}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="p-5">
                  <p className="font-display text-lg font-semibold">{c.name}</p>
                  <p className="mt-1 text-xs font-medium text-ink-soft">
                    {c.prompt_count} prompt{c.prompt_count === 1 ? "" : "s"} &middot; {c.skill_count} skill{c.skill_count === 1 ? "" : "s"}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-ink-soft">
                    {c.description || meta?.blurb}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pt-20">
        <h2 className="font-display text-2xl font-semibold sm:text-3xl">Why we built this</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-line p-6">
            <p className="font-display font-semibold">Tested, not generated on the spot</p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              Every prompt and skill here came out of real work, ours or a client&apos;s, not a bulk
              AI-generated list. If it&apos;s in the library, we&apos;ve actually used it and it produced
              something worth keeping.
            </p>
          </div>
          <div className="rounded-2xl border border-line p-6">
            <p className="font-display font-semibold">Organized by outcome, not by tool</p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              Categories are Images, Video, Agents, Coding, Marketing, and Automation because
              that&apos;s how people actually think about what they&apos;re trying to make, not which
              specific product happens to be trendy this month.
            </p>
          </div>
          <div className="rounded-2xl border border-line p-6">
            <p className="font-display font-semibold">Prompts, skills, and guides, kept separate</p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              A quick one-off prompt, a reusable agent skill, and a step-by-step video guide solve
              different problems, so each gets its own tab instead of being mixed into one
              confusing list.
            </p>
          </div>
          <div className="rounded-2xl border border-line p-6">
            <p className="font-display font-semibold">Public, with no catch</p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              No login wall, no email required. It&apos;s free because we think it&apos;s useful, and
              it&apos;ll keep growing as we add more free resources alongside it.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pt-20">
        <h2 className="font-display text-2xl font-semibold sm:text-3xl">How it works</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {[
            { step: "1", title: "Pick a tab, then browse", desc: "Prompts, Skills, and Guides each have their own tab, filterable by category and searchable." },
            { step: "2", title: "Copy or download", desc: "Copy a prompt straight into your AI tool, or download a skill file into your agent's skills folder." },
            { step: "3", title: "Come back for more", desc: "No account needed, but a free account gets you courses, community, and our newsletter too." },
          ].map((s) => (
            <div key={s.step} className="rounded-2xl border border-line p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-sm font-semibold text-paper">
                {s.step}
              </span>
              <p className="mt-4 font-display font-semibold">{s.title}</p>
              <p className="mt-2 text-sm leading-6 text-ink-soft">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pt-20">
        <div className="rounded-2xl border border-line bg-paper-soft p-8 sm:p-10">
          <p className="font-display text-xl font-semibold sm:text-2xl">
            The library is public, open it and start browsing
          </p>
          <p className="mt-2 max-w-xl text-sm text-ink-soft">
            No login required. Search by keyword or filter by category and type.
          </p>
          <Link
            href="/resources/prompt-skill-library/browse"
            className="mt-5 inline-flex rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80"
          >
            Open the Library
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="font-display text-2xl font-semibold sm:text-3xl">Frequently asked questions</h2>
        <div className="mt-8 space-y-4">
          {FAQS.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-line bg-paper open:bg-paper-soft transition-colors">
              <summary className="flex cursor-pointer items-center justify-between gap-3 p-6 list-none [&::-webkit-details-marker]:hidden">
                <p className="font-medium">{f.q}</p>
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 shrink-0 text-ink-soft transition-transform group-open:rotate-90"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </summary>
              <p className="px-6 pb-6 text-sm leading-6 text-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>

        <p className="mt-10 text-sm text-ink-soft">
          More free resources are coming to this section over time, including ebooks and case
          studies. See everything available now on the{" "}
          <Link href="/resources" className="font-medium text-ink underline underline-offset-2">
            Free Resources page
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
