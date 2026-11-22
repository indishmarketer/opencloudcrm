import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicPosts } from "@/lib/blogPosts";
import { getBlogCategories } from "@/lib/blogCategories";
import { getAdminSession, getSession } from "@/lib/auth";
import { recordCourseView } from "@/lib/courseInterest";
import { pool } from "@/lib/db";
import { getCourseBySlug, getCourseCurriculum, getUserEnrollment, type CourseSections } from "@/lib/courses";
import { getSiteOwnerProfile } from "@/lib/siteMembers";
import { getSiteIdentity, resolveSiteName } from "@/lib/siteIdentity";
import UnlockProModal from "@/components/UnlockProModal";
import { checkoutOffer, getCheckoutRegion, accountPhone } from "@/lib/checkoutRegion";
import { createPriceQuote } from "@/lib/priceQuote";
import ViewContentTracked from "@/components/ViewContentTracked";
import { formatCoursePrice, getCoursePrices } from "@/lib/currency";
import { serializeJsonLd } from "@/lib/jsonLd";
import { SITE_NAME, OG_LOCALE } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { isKnownImageHost } from "@/lib/liveImageHost";
import { getPublishedPage } from "@/lib/sitePages";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  if (!course) return {};
  if (!course.published && !(await getAdminSession())) return {};
  const canonicalPath = `/courses/${course.slug}`;
  return {
    title: course.title,
    description: course.description || course.subtitle || undefined,
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: "website",
      title: course.title,
      description: course.description || course.subtitle || undefined,
      url: canonicalPath,
      siteName: SITE_NAME,
      locale: OG_LOCALE,
      ...(course.cover_image_url ? { images: [{ url: course.cover_image_url, alt: course.title }] } : {}),
    },
    ...(!course.published ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function CourseLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await getPublishedPage("/courses"))) notFound();
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  const session = await getSession();
  const isAdmin = await getAdminSession();
  
  if (!course || (!course.published && !isAdmin)) notFound();

  const [modules, ownerProfile, siteIdentity] = await Promise.all([
    getCourseCurriculum(course.id),
    getSiteOwnerProfile(),
    getSiteIdentity(),
  ]);
  const enrollment = session ? await getUserEnrollment(session.userId, course.id) : null;

  // Who looked, when we can tell. A signed-in visitor is known; so is
  // one who arrived from a guide email, which carries the token we
  // issued to that address. Everyone else stays anonymous. Never allowed
  // to break the page, since this is analytics, not content.
  {
    const query = await searchParams;
    const guideToken = typeof query.g === "string" ? query.g : null;
    if (session?.email || guideToken) {
      await recordCourseView({
        courseId: course.id,
        courseSlug: course.slug,
        courseTitle: course.title,
        email: session?.email ?? null,
        userId: session?.userId ?? null,
        guideToken,
      }).catch((error) => console.error("course view tracking failed (non-fatal):", error));
    }
  }
  const userName = session
    ? (await pool.query("SELECT name FROM users WHERE id = $1", [session.userId])).rows[0]?.name || session.email
    : null;
  // There's no per-deployment "trainer" record -- show whoever this
  // deployment's console owner (ADMIN_EMAIL) actually is, with a generic
  // fallback (never another deployment's real name/photo/social links)
  // when they haven't filled in their profile yet. Was previously
  // hardcoded to the project maintainer's own identity from src/data/
  // authors.ts, which every fresh self-host inherited unchanged.
  const trainer = {
    name: ownerProfile?.name || resolveSiteName(siteIdentity),
    role: "Course Instructor",
    avatar: ownerProfile?.avatar_url || null,
    url: null,
  };
  const [postsIndex, blogCategories] = await Promise.all([getPublicPosts(), getBlogCategories()]);

  // Stored as jsonb, so guard the shape rather than trust it: a
  // half-written section must not take the whole course page down.
  const sections = (course.sections && typeof course.sections === "object" ? course.sections : {}) as CourseSections;
  const totalLessons = modules.reduce((sum, m) => sum + m.lessons.length, 0);
  const hasFreeTier = modules.some((m) => m.tier === "free");
  const prices = await getCoursePrices(course);
  // One price and one payment method per visitor: INR/Razorpay in India,
  // USD/PayPal elsewhere, by the account's country (else Cloudflare's IP guess).
  const offer = checkoutOffer(await getCheckoutRegion(session?.userId ?? null), prices);
  const userPhone = session ? await accountPhone(session.userId) : null;
  const shownPrice = offer.amount != null && offer.method ? { amount: offer.amount, currency: offer.currency } : prices.base;
  const priceQuote = createPriceQuote(course.id, prices);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    "@id": `${SITE_URL}/courses/${course.slug}#course`,
    url: `${SITE_URL}/courses/${course.slug}`,
    name: course.title,
    description: course.description || course.subtitle || undefined,
    image: course.cover_image_url || undefined,
    inLanguage: "en",
    provider: { "@id": `${SITE_URL}/#organization` },
    instructor: {
      "@type": "Person",
      name: trainer.name,
      ...(trainer.url ? { url: `${SITE_URL}${trainer.url}` } : {}),
    },
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "online",
    },
    ...(prices.base
      ? {
          offers: {
            "@type": "Offer",
            price: prices.base.amount,
            priceCurrency: prices.base.currency,
            availability: "https://schema.org/InStock",
            url: `${SITE_URL}/courses/${course.slug}`,
          },
        }
      : {}),
  };

  return (
    <>
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <ViewContentTracked courseSlug={course.slug} courseTitle={course.title} price={shownPrice?.amount ?? null} currency={shownPrice?.currency ?? "INR"} />

      {course.cover_image_url && (
        <div className="relative aspect-[1200/650] w-full overflow-hidden border-b border-line">
          <Image
            src={course.cover_image_url}
            alt={course.title}
            fill
            priority
            unoptimized={!isKnownImageHost(course.cover_image_url)}
            className="object-cover"
          />
        </div>
      )}

      <div className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="font-display text-4xl font-semibold">{course.title}</h1>
        {course.subtitle && <p className="mt-3 text-lg text-ink-soft">{course.subtitle}</p>}
        {course.description && <p className="mt-6 text-ink-soft">{course.description}</p>}

        <div className="mt-8 flex flex-wrap gap-3">
          {enrollment ? (
            <Link
              href={`/account/courses/${course.slug}`}
              className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-on shadow-[0_8px_20px_-10px_var(--accent)] transition-opacity hover:opacity-90"
            >
              Go to your course
            </Link>
          ) : hasFreeTier ? (
            <Link
              href={`/courses/${course.slug}/enroll`}
              className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-on shadow-[0_8px_20px_-10px_var(--accent)] transition-opacity hover:opacity-90"
            >
              Enroll for free
            </Link>
          ) : (
            <a
              href="#buy"
              className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-on shadow-[0_8px_20px_-10px_var(--accent)] transition-opacity hover:opacity-90"
            >
              Buy Now
            </a>
          )}
          <span className="rounded-full border border-line px-5 py-3 text-sm text-ink-soft">
            {modules.length} modules · {totalLessons} lessons
          </span>
        </div>

        <Link
          href={trainer.url || "#"}
          className={`mt-12 flex items-center gap-4 rounded-2xl border border-line bg-paper p-6 ${
            trainer.url ? "transition-colors hover:border-ink" : "pointer-events-none"
          }`}
        >
          {trainer.avatar && (
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full">
              <Image
                src={trainer.avatar}
                alt={trainer.name}
                fill
                unoptimized={!isKnownImageHost(trainer.avatar)}
                className="object-cover"
              />
            </div>
          )}
          <div>
            <p className="font-medium">{trainer.name}</p>
            <p className="text-sm text-ink-soft">{trainer.role}</p>
          </div>
        </Link>

        {/* What the course actually does for them. A title and a module
            list describes a course; none of it answers "should I buy
            this". Each list is optional and skipped when empty, so a
            course with nothing set renders as it always did. */}
        {!!sections.outcomes?.length && (
          <div className="mt-16">
            <h2 className="font-display text-2xl font-semibold">What you will be able to do</h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {sections.outcomes.map((item) => (
                <li key={item} className="flex gap-3 text-ink-soft">
                  <svg className="mt-1 h-5 w-5 shrink-0 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(!!sections.audience?.length || !!sections.requirements?.length) && (
          <div className="mt-16 grid gap-10 md:grid-cols-2">
            {!!sections.audience?.length && (
              <div>
                <h2 className="font-display text-2xl font-semibold">Who this is for</h2>
                <ul className="mt-6 space-y-3">
                  {sections.audience.map((item) => (
                    <li key={item} className="flex gap-3 text-ink-soft">
                      <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!!sections.requirements?.length && (
              <div>
                <h2 className="font-display text-2xl font-semibold">What you need before you start</h2>
                <ul className="mt-6 space-y-3">
                  {sections.requirements.map((item) => (
                    <li key={item} className="flex gap-3 text-ink-soft">
                      <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="mt-16">
          <h2 className="font-display text-2xl font-semibold">Curriculum</h2>
          <div className="mt-6 space-y-4">
            {modules.map((m) => (
              <details
                key={m.id}
                className="group rounded-2xl border border-line bg-paper open:bg-paper-soft transition-colors"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-3 p-6 list-none [&::-webkit-details-marker]:hidden">
                  <div className="flex items-center gap-3">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 text-ink-soft transition-transform group-open:rotate-90"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <p className="font-medium">
                      Module {m.position}: {m.title}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      m.tier === "pro" ? "bg-ink text-paper" : "bg-paper-soft text-ink-soft"
                    }`}
                  >
                    {m.tier === "pro" ? "PRO" : "Free"}
                  </span>
                </summary>
                <div className="px-6 pb-6 pt-2 border-t border-line mx-6 mt-0">
                  {m.description && <p className="mb-4 text-sm text-ink-soft">{m.description}</p>}
                  <ul className="space-y-2 text-sm text-ink-soft">
                    {m.lessons.map((l, idx) => (
                      <li key={l.id} className="flex gap-2">
                        <span className="text-ink-soft/50">{idx + 1}.</span> {l.title}
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            ))}
          </div>
        </div>

        {!!sections.faq?.length && (
          <div className="mt-16">
            <h2 className="font-display text-2xl font-semibold">Questions people ask</h2>
            <div className="mt-6 space-y-3">
              {sections.faq.map((item) => (
                <details key={item.q} className="group rounded-2xl border border-line bg-paper p-6 open:bg-paper-soft transition-colors">
                  <summary className="cursor-pointer list-none font-medium">
                    <span className="flex items-start justify-between gap-4">
                      <span>{item.q}</span>
                      <span aria-hidden="true" className="mt-1 shrink-0 text-ink-soft transition-transform group-open:rotate-45">+</span>
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-ink-soft">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        )}

        {shownPrice && enrollment?.tier !== "pro" && (
          <div id={hasFreeTier ? "unlock-pro" : "buy"} className="mt-16 rounded-2xl border border-line bg-paper-soft p-8">
            <h2 className="font-display text-2xl font-semibold">{hasFreeTier ? "Unlock PRO" : "Get Instant Access"}</h2>
            <p className="mt-2 text-sm text-ink-soft">
              {hasFreeTier
                ? "Get every module, including the advanced PRO content."
                : "Get instant access to the full course, all modules, the moment you complete payment."}
            </p>
            <p className="mt-4">
              <span className="font-display text-3xl font-semibold">{formatCoursePrice(shownPrice.amount, shownPrice.currency)}</span>
              <span className="ml-2 text-sm text-ink-soft">{shownPrice.currency}, one-time payment</span>
            </p>
            <div className="mt-6">
              {session ? (
                <UnlockProModal
                  courseId={course.id}
                  courseSlug={course.slug}
                  offer={offer}
                  priceQuote={priceQuote}
                  userId={session.userId}
                  userName={userName || session.email}
                  userEmail={session.email}
                  userPhone={userPhone}
                  buttonLabel={hasFreeTier ? "Unlock PRO" : "Buy Now"}
                  modalTitle={hasFreeTier ? "Unlock PRO access" : "Get instant access"}
                />
              ) : (
                <Link
                  href={`/signup?redirect=${encodeURIComponent(`/courses/${course.slug}`)}`}
                  className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-on shadow-[0_8px_20px_-10px_var(--accent)] transition-opacity hover:opacity-90"
                >
                  {hasFreeTier ? "Sign up to unlock PRO" : "Sign up to buy"}
                </Link>
              )}
            </div>
          </div>
        )}

        <div className="mt-16 border-t border-line pt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink-soft">From the blog</p>
          <h2 className="mt-4 font-display text-2xl font-semibold">Recommended reading</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {postsIndex
              .filter(p => p.category === "ai-automation" || p.category === "make-money-online")
              .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
              .slice(0, 2)
              .map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group flex flex-col justify-between rounded-2xl border border-line p-6 transition-colors hover:border-ink/40 hover:bg-paper-soft"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                    {blogCategories.find(c => c.slug === post.category)?.name || "Blog"}
                  </p>
                  <h3 className="mt-2 font-display text-lg font-semibold leading-snug group-hover:underline">
                    {post.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-ink-soft line-clamp-3">{post.excerpt}</p>
                </div>
                <p className="mt-6 text-sm font-medium text-ink group-hover:underline">Read post →</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
