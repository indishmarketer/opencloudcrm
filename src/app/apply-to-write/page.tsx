import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Bot, Check, Lightbulb, Megaphone, Workflow } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getAuthorApplicationByToken, getLatestApplicationForUser } from "@/lib/authorApplications";
import AuthorApplicationFlow from "@/components/AuthorApplicationFlow";
import { SITE_NAME, OG_LOCALE } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { serializeJsonLd } from "@/lib/jsonLd";

const title = `Write for Us: Guest Post Guidelines`;
const description = `Apply to become a contributor at ${SITE_NAME}. Share practical, experience-led articles about AI, automation, marketing, online business, and systems you have built.`;
const image = "https://images.indishmarketer.com/page-images/aeb07cc4-b182-4664-8238-90686f2215b2.webp";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ token?: string }> }): Promise<Metadata> {
  const hasToken = Boolean((await searchParams).token);
  return {
    title,
    description,
    alternates: { canonical: "/apply-to-write" },
    referrer: "no-referrer",
    ...(hasToken ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      type: "website",
      url: `${SITE_URL}/apply-to-write`,
      siteName: SITE_NAME,
      locale: OG_LOCALE,
      title: `Write for ${SITE_NAME}`,
      description,
      images: [{ url: image, width: 1200, height: 900, alt: "A raw idea becoming a polished published article" }],
    },
    twitter: { card: "summary_large_image", title: `Write for ${SITE_NAME}`, description, images: [image] },
  };
}

const topics = [
  { icon: Bot, title: "AI in real work", text: "How you use AI to research, create, sell, support customers, or run a business." },
  { icon: Workflow, title: "Automation and systems", text: "Workflows you built, what they connect, what broke, and what you learned." },
  { icon: Megaphone, title: "Marketing and online income", text: "Useful lessons from content, email, social media, products, services, and audience growth." },
  { icon: Lightbulb, title: "Things you have built", text: "A project, experiment, tool, process, or unusual solution that other people can learn from." },
];

const faqs = [
  { q: "Do I need an account to apply?", a: "No. Send your name, email, pitch, and one writing sample. If we approve you, we email a private link for submitting your full draft." },
  { q: "Can I use AI while writing?", a: "Yes. AI can help you organize, edit, research, or improve grammar. The experience, examples, judgment, and final point of view must be yours." },
  { q: "What can I use as a writing sample?", a: "Share a Medium, Substack, blog, portfolio, or public document link. You can also paste an excerpt or upload a PDF, Word, OpenDocument, text, or Markdown file." },
  { q: "Do you accept articles that were already published?", a: "Use published work as your sample, but send an original draft for this site unless we agree to a different arrangement." },
  { q: "Can I add links to my website?", a: "Relevant references and a useful author byline are welcome. We do not accept posts written mainly to place promotional or paid links." },
  { q: "Will every approved application be published?", a: "No. Approval means we want to read a full draft. We may request changes, accept it, or decide that the finished piece is not right for the publication." },
];

export default async function ApplyToWritePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token?.trim() || null;
  const session = token ? null : await getSession();
  const application = token
    ? await getAuthorApplicationByToken(token)
    : session ? await getLatestApplicationForUser(session.userId) : null;
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
  };

  return (
    <div className="overflow-hidden">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqJsonLd) }} />

      <section className="relative border-b border-line bg-paper py-12 sm:py-16 lg:py-20">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_36%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Become a contributor</p>
            <h1 className="mt-5 text-balance font-display text-4xl font-bold leading-[1.08] sm:text-5xl lg:text-6xl">
              Have something useful to share? <span className="text-accent">Write with us.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-ink-soft">
              If you write on Medium, Substack, your own blog, or anywhere else, you can also become part of the {SITE_NAME} writer community. We publish clear, practical stories about AI, marketing, automation, online business, and systems people have actually built.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a href="#apply" className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-on shadow-[0_12px_28px_-14px_var(--accent)] hover:opacity-90">Apply to write <ArrowRight className="h-4 w-4" /></a>
              <Link href="/blog" className="rounded-full border border-line px-6 py-3 text-sm font-semibold transition-colors hover:border-accent hover:text-accent">Read our blog</Link>
            </div>
            <ul className="mt-8 grid gap-3 text-sm text-ink-soft sm:grid-cols-3">
              {["No login needed", "Every sample reviewed", "Your name and byline"].map((item) => <li key={item} className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft text-accent"><Check className="h-3.5 w-3.5" /></span>{item}</li>)}
            </ul>
          </div>
          <div className="relative overflow-hidden rounded-[2rem] border border-line bg-[#f7f4f2] shadow-[0_30px_80px_-48px_rgba(76,29,149,0.55)]">
            <Image src={image} alt="A raw idea passing through an editorial frame and becoming a polished article" width={1200} height={900} priority sizes="(min-width: 1024px) 46vw, 100vw" className="h-auto w-full" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Who should apply</p><h2 className="mt-4 text-balance font-display text-3xl font-bold sm:text-4xl">You do not need a famous name. You need a real point of view.</h2></div>
          <div className="space-y-5 text-base leading-8 text-ink-soft">
            <p>You may already publish on Medium or Substack. You may run a small website, write a newsletter, work as a content writer, or simply have one useful story that deserves a clear explanation.</p>
            <p>What matters is that you understand the subject and can show readers something you learned, tested, built, fixed, or changed. We would rather publish a specific lesson from real work than a broad article that says what everyone already knows.</p>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-paper-soft py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Topics we cover</p>
          <h2 className="mt-4 max-w-3xl text-balance font-display text-3xl font-bold sm:text-4xl">Write about work you understand well enough to explain simply.</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {topics.map(({ icon: Icon, title: topicTitle, text }) => <article key={topicTitle} className="rounded-3xl border border-line bg-paper p-6 lift-on-hover sm:p-7"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent"><Icon className="h-5 w-5" /></span><h3 className="mt-5 font-display text-xl font-semibold">{topicTitle}</h3><p className="mt-2 leading-7 text-ink-soft">{text}</p></article>)}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Editorial standard</p>
            <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Experience first. Helpful writing second.</h2>
            <p className="mt-5 leading-8 text-ink-soft">We follow the spirit of E-E-A-T: experience, expertise, authority, and trust. That does not mean you need formal credentials for every topic. It means the article should make it clear why you know what you are talking about.</p>
            <ul className="mt-7 space-y-4">
              {["Use examples, screenshots, results, mistakes, or steps from your own work.", "Support factual claims with reliable sources when a reader should verify them.", "Be honest about what you tested, what you did not test, and what is your opinion.", "Write an original article that gives the reader a useful next step."].map((item) => <li key={item} className="flex gap-3 leading-7"><Check className="mt-1 h-5 w-5 shrink-0 text-accent" /><span>{item}</span></li>)}
            </ul>
          </div>
          <div className="rounded-3xl bg-ink p-7 text-paper sm:p-9">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">Our AI policy</p>
            <h2 className="mt-4 font-display text-3xl font-bold">Use AI as an assistant, not as the author.</h2>
            <div className="mt-5 space-y-4 leading-8 text-paper/70">
              <p>AI can help you fix grammar, organize a transcript, simplify a sentence, research a source, or shape a rough draft. We use it too.</p>
              <p>A practical way to work is to dictate what you learned, record yourself explaining a process, or write rough notes in your own words. Then use AI to make that material clearer. The story and judgment still come from you.</p>
              <p>We do not publish fully generated articles that contain no personal knowledge, proof, useful examples, or original point of view.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-paper-soft py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Writing guidelines</p><h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Make it sound like a clear conversation.</h2><p className="mt-5 leading-8 text-ink-soft">Read a few posts on our blog before you pitch. You will notice that we prefer simple words, direct explanations, and useful detail.</p></div>
          <div className="mt-10 grid gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-2">
            {[{ t: "Keep the language simple", d: "Write for a smart reader who may be new to the topic. Explain technical words when you need them." }, { t: "Prefer active voice", d: "Say who did what. Passive voice is fine when it sounds natural, but it should not make the writing vague." }, { t: "Use a natural rhythm", d: "Avoid inflated phrases, repetitive conclusions, and punctuation patterns that make the article feel machine-written." }, { t: "Give the article a purpose", d: "A reader should know what they will learn, follow the explanation, and leave able to do or understand something." }, { t: "Do not write for a backlink", d: "Useful references are welcome. Promotional links, paid placements, and thin guest posts are not." }, { t: "Respect other people's work", d: "Do not copy, spin, or lightly rewrite someone else's article. Credit ideas, data, images, and quotations properly." }].map((item) => <div key={item.t} className="bg-paper p-6 sm:p-7"><h3 className="font-display text-lg font-semibold">{item.t}</h3><p className="mt-2 text-sm leading-7 text-ink-soft">{item.d}</p></div>)}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">How it works</p>
        <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">A simple review process.</h2>
        <ol className="mt-10 grid gap-5 md:grid-cols-4">
          {[{ n: "01", t: "Apply", d: "Send your name, email, topic, and one writing sample. No login is required." }, { n: "02", t: "We review", d: "A person checks the sample, your experience, and whether the topic fits." }, { n: "03", t: "Submit a draft", d: "If approved, use your private link to upload a document or share a live draft." }, { n: "04", t: "Revise and publish", d: "We may request edits. Once accepted, we collect your byline links and prepare the post." }].map((step) => <li key={step.n} className="rounded-3xl border border-line p-6"><span className="text-sm font-bold text-accent">{step.n}</span><h3 className="mt-5 font-display text-xl font-semibold">{step.t}</h3><p className="mt-2 text-sm leading-7 text-ink-soft">{step.d}</p></li>)}
        </ol>
      </section>

      <section id="apply" className="scroll-mt-24 border-y border-line bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_8%,var(--paper)),var(--paper)_55%)] py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[0.78fr_1.22fr] lg:gap-16">
          <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Apply to write</p><h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Start with one good sample.</h2><p className="mt-5 leading-8 text-ink-soft">You do not need to send a finished guest post today. Tell us what you want to cover and show us how you write. If it fits, we will invite the full draft.</p><div className="mt-7 rounded-2xl border border-accent/20 bg-paper/70 p-5 text-sm leading-7"><strong>Before you send:</strong> make sure any Google Doc or Notion link can be opened by someone with the link.</div></div>
          <AuthorApplicationFlow application={application ? { id: application.id, status: application.status, submission_url: application.submission_url, submission_note: application.submission_note, submission_file_name: application.submission_file_name, admin_note: application.admin_note, social_links: application.social_links } : null} token={token} />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <div className="text-center"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Questions</p><h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Before you apply</h2></div>
        <dl className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">{faqs.map((item) => <div key={item.q}><dt className="font-display text-lg font-semibold">{item.q}</dt><dd className="mt-2 text-sm leading-7 text-ink-soft">{item.a}</dd></div>)}</dl>
      </section>

      <section className="bg-ink py-16 text-paper sm:py-20"><div className="mx-auto max-w-3xl px-6 text-center"><h2 className="text-balance font-display text-3xl font-bold sm:text-4xl">Your experience may be exactly what another reader needs.</h2><p className="mx-auto mt-4 max-w-2xl leading-8 text-paper/70">Bring the lesson, the example, and your honest point of view. We will help shape it into a clear article.</p><a href="#apply" className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-on hover:opacity-90">Apply to write <ArrowRight className="h-4 w-4" /></a></div></section>
    </div>
  );
}
