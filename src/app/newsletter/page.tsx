import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, Check, Code2, Mail, Megaphone, ReceiptText } from "lucide-react";
import SafeImage from "@/components/SafeImage";
import NewsletterSignupForm from "@/components/NewsletterSignupForm";
import { getPublicPosts } from "@/lib/blogPosts";
import { buildSafe } from "@/lib/db";
import { resolveImage } from "@/lib/images";
import { SITE_NAME, OG_LOCALE, assetUrl } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";

const OG_IMAGE = assetUrl("newsletter/og-newsletter.png");
const HERO_IMAGE = "https://images.indishmarketer.com/newsletter/32c2c305-10f7-4a33-b37f-51b18883aba9.webp";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Newsletter by Indish Marketer",
  description: `A practical Sunday newsletter about AI, marketing, automation, online business, and the systems behind them. Free from ${SITE_NAME}.`,
  alternates: { canonical: `${SITE_URL}/newsletter` },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/newsletter`,
    siteName: SITE_NAME,
    locale: OG_LOCALE,
    title: `The ${SITE_NAME} Newsletter`,
    description: "One useful email every Sunday about building the system instead of renting it.",
    images: [{ url: OG_IMAGE, width: 1520, height: 800, alt: `The ${SITE_NAME} newsletter` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `The ${SITE_NAME} Newsletter`,
    description: "One useful email every Sunday about building the system instead of renting it.",
    images: [OG_IMAGE],
  },
};

const benefits = [
  { icon: Code2, title: "What I actually built", text: "The system, workflow, page, or experiment I shipped that week, including what worked and what broke." },
  { icon: Bot, title: "How AI helped", text: "Useful prompts, agent workflows, and practical ways to turn rough thinking into something that works." },
  { icon: ReceiptText, title: "A cost you can question", text: "A tool, subscription, or process worth replacing, with an honest look at the tradeoffs." },
  { icon: Megaphone, title: "Marketing that leads somewhere", text: "Lessons from content, email, offers, traffic, and audience building without empty growth advice." },
];

const format = [
  { n: "01", title: "One useful idea", text: "A clear lesson from something I built, tested, fixed, or learned recently." },
  { n: "02", title: "The practical detail", text: "The prompt, process, tool, cost, mistake, or example that makes the lesson usable." },
  { n: "03", title: "A next step", text: "Something simple you can try in your own work after reading the email." },
];

export default async function NewsletterPage() {
  const recentPosts = await buildSafe(async () => (await getPublicPosts()).slice(0, 3), []);

  return (
    <div className="overflow-hidden">
      <section className="relative border-b border-line bg-paper py-12 sm:py-16 lg:py-20">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_37%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">The Sunday newsletter</p>
            <h1 className="mt-5 text-balance font-display text-4xl font-bold leading-[1.08] sm:text-5xl lg:text-6xl">
              Build the system. <span className="text-accent">Own the result.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-ink-soft">
              Join 5,000+ founders, marketers, writers, and creators who get one practical email every Sunday about AI, marketing, automation, online business, and the systems behind the work.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a href="#newsletter-signup" className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-on shadow-[0_12px_28px_-14px_var(--accent)] hover:opacity-90">
                Subscribe for free <ArrowRight className="h-4 w-4" />
              </a>
              <Link href="/blog" className="rounded-full border border-line px-6 py-3 text-sm font-semibold transition-colors hover:border-accent hover:text-accent">Read the blog</Link>
            </div>
            <ul className="mt-8 grid gap-3 text-sm text-ink-soft sm:grid-cols-3">
              {["One email on Sunday", "Free to join", "Leave in one click"].map((item) => (
                <li key={item} className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft text-accent"><Check className="h-3.5 w-3.5" /></span>{item}</li>
              ))}
            </ul>
          </div>
          <div className="relative mx-auto w-full max-w-[420px] overflow-hidden rounded-[2rem] border border-line bg-[#f7f4f2] shadow-[0_30px_80px_-48px_rgba(76,29,149,0.55)] lg:max-w-none">
            <SafeImage src={HERO_IMAGE} alt="The Indish Marketer newsletter connecting AI systems, marketing, automation, and revenue" width={1092} height={1440} priority sizes="(min-width: 1024px) 46vw, 100vw" className="h-auto w-full" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Why subscribe</p>
            <h2 className="mt-4 text-balance font-display text-3xl font-bold sm:text-4xl">A useful note from the work, not a collection of headlines.</h2>
          </div>
          <div className="space-y-5 text-base leading-8 text-ink-soft">
            <p>I write after building something, testing an idea, or finding a better way to complete a real task. The email explains the useful part without turning it into a long theory lesson.</p>
            <p>Some weeks that means an AI workflow. Other weeks it is a marketing lesson, a system running on my own server, a writing process, or a tool bill that no longer makes sense.</p>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-paper-soft py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">What is inside</p>
          <h2 className="mt-4 max-w-3xl text-balance font-display text-3xl font-bold sm:text-4xl">A small email with enough detail to be useful.</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {benefits.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-3xl border border-line bg-paper p-6 lift-on-hover sm:p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent"><Icon className="h-5 w-5" /></span>
                <h3 className="mt-5 font-display text-xl font-semibold">{title}</h3>
                <p className="mt-2 leading-7 text-ink-soft">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Written from experience</p>
            <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">The newsletter follows the same standard as the blog.</h2>
            <p className="mt-5 leading-8 text-ink-soft">I use AI to organize notes, improve grammar, and make rough explanations clearer. The lesson, example, result, and opinion still come from work I did myself.</p>
            <ul className="mt-7 space-y-4">
              {["Simple language and direct explanations.", "Real examples, costs, mistakes, and results.", "No paid placement disguised as advice.", "No fully generated filler written only to publish something."].map((item) => (
                <li key={item} className="flex gap-3 leading-7"><Check className="mt-1 h-5 w-5 shrink-0 text-accent" /><span>{item}</span></li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl bg-ink p-7 text-paper sm:p-9">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">The promise</p>
            <h2 className="mt-4 font-display text-3xl font-bold">You should finish the email with one clearer idea.</h2>
            <div className="mt-5 space-y-4 leading-8 text-paper/70">
              <p>I will not send an email simply because Sunday arrived. Each issue needs a useful subject and a reason for being in your inbox.</p>
              <p>If a tool is mentioned, I will explain why it matters. If I share a result, I will give the context. If something failed, I will say that too.</p>
              <p>You can unsubscribe in one click whenever the newsletter stops being useful to you.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-paper-soft py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">The Sunday format</p>
          <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Easy to read. Easy to use.</h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {format.map((item) => (
              <li key={item.n} className="rounded-3xl border border-line bg-paper p-6">
                <span className="text-sm font-bold text-accent">{item.n}</span>
                <h3 className="mt-5 font-display text-xl font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-7 text-ink-soft">{item.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {recentPosts.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">From the blog</p><h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Read before you subscribe.</h2></div>
            <Link href="/blog" className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:border-accent hover:text-accent">View all posts</Link>
          </div>
          <p className="mt-4 max-w-2xl leading-8 text-ink-soft">These recent articles show the kind of practical, experience-led thinking that goes into the Sunday email.</p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {recentPosts.map((post) => {
              const image = resolveImage(post.feature_image);
              return (
                <Link key={post.slug} href={`/blog/${post.slug}`} className="group flex flex-col overflow-hidden rounded-3xl border border-line bg-paper">
                  {image && <div className="relative aspect-[1200/650] overflow-hidden border-b border-line bg-paper-soft"><SafeImage src={image} alt={post.title} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" /></div>}
                  <div className="flex flex-1 flex-col p-6"><h3 className="font-display text-lg font-semibold leading-snug">{post.title}</h3><p className="mt-2 line-clamp-3 text-sm leading-6 text-ink-soft">{post.excerpt}</p><span className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-accent">Read article <ArrowRight className="h-3.5 w-3.5" /></span></div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section id="newsletter-signup" className="scroll-mt-24 border-y border-line bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_8%,var(--paper)),var(--paper)_55%)] py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl items-start gap-10 px-6 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Join the newsletter</p>
            <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">The next useful idea arrives on Sunday.</h2>
            <p className="mt-5 leading-8 text-ink-soft">Enter your name and email, then confirm the link we send you. That is all. There is no paid tier and no account to manage.</p>
            <div className="mt-7 flex items-center gap-3 text-sm text-ink-soft"><Mail className="h-5 w-5 text-accent" /><span>Free forever. Unsubscribe whenever you want.</span></div>
          </div>
          <div className="rounded-3xl border border-line bg-paper p-6 shadow-[0_24px_70px_-45px_rgba(109,40,217,0.45)] sm:p-9">
            <NewsletterSignupForm />
          </div>
        </div>
      </section>

      <section className="bg-ink py-16 text-paper sm:py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-balance font-display text-3xl font-bold sm:text-4xl">Own more of the system behind your work.</h2>
          <p className="mx-auto mt-4 max-w-2xl leading-8 text-paper/70">One practical note every Sunday about building, marketing, automating, and learning from the result.</p>
          <a href="#newsletter-signup" className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-on hover:opacity-90">Subscribe for free <ArrowRight className="h-4 w-4" /></a>
        </div>
      </section>
    </div>
  );
}
