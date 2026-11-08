import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getCourseBySlug, getCourseCurriculum, getUserEnrollment } from "@/lib/courses";
import { getPublishedEntityPage } from "@/lib/sitePages";
import { getCheckoutRegion, checkoutOffer, accountPhone } from "@/lib/checkoutRegion";
import { createPriceQuote } from "@/lib/priceQuote";
import { getCoursePrices } from "@/lib/currency";
import PageBlocks from "@/components/pageBlocks/PageBlocks";
import UnlockProModal from "@/components/UnlockProModal";
import { SITE_NAME } from "@/config/brand";
import { requirePageGroupEnabled } from "@/lib/pageGroupToggles";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  if (!course?.published) return {};
  const page = await getPublishedEntityPage("course", course.id);
  if (!page) return {};
  return {
    title: page.metaTitle || page.title || `${course.title} | ${SITE_NAME}`,
    description: page.metaDescription || course.description || course.subtitle || undefined,
    alternates: { canonical: `/courses/${course.slug}/sales` },
    ...(page.ogImage ? { openGraph: { images: [{ url: page.ogImage }] } } : {}),
    ...(page.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function CourseSalesPage({ params }: Props) {
  await requirePageGroupEnabled("courses");
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  if (!course?.published) notFound();

  const page = await getPublishedEntityPage("course", course.id);
  if (!page) notFound();

  const [modules, session] = await Promise.all([getCourseCurriculum(course.id), getSession()]);
  const enrollment = session ? await getUserEnrollment(session.userId, course.id) : null;
  const hasFreeTier = modules.some((module) => module.tier === "free");
  const prices = await getCoursePrices(course);
  const offer = checkoutOffer(await getCheckoutRegion(session?.userId ?? null), prices);
  const priceQuote = createPriceQuote(course.id, prices);
  const account = session
    ? await pool.query<{ name: string | null }>("SELECT name FROM users WHERE id = $1", [session.userId])
    : null;
  const phone = session ? await accountPhone(session.userId) : null;
  const signUpTarget = `/courses/${course.slug}/enroll`;

  return (
    <>
      <PageBlocks blocks={page.blocks} />
      <section id="purchase" className="mx-auto my-16 max-w-4xl px-6">
        <div className="rounded-3xl border border-line bg-paper p-8 sm:p-10">
          <h2 className="font-display text-2xl font-semibold">{course.title}</h2>
          {course.subtitle && <p className="mt-2 text-ink-soft">{course.subtitle}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            {enrollment ? (
              <Link href={`/account/courses/${course.slug}`} className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper hover:opacity-80">
                Go to your course
              </Link>
            ) : (
              <>
                {hasFreeTier && (
                  <Link
                    href={session ? signUpTarget : `/signup?redirect=${encodeURIComponent(signUpTarget)}`}
                    className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper hover:opacity-80"
                  >
                    Enroll for free
                  </Link>
                )}
                {!hasFreeTier && !session && (
                  <Link href={`/signup?redirect=${encodeURIComponent(signUpTarget)}`} className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper hover:opacity-80">
                    Create an account to buy
                  </Link>
                )}
                {session && (
                  <UnlockProModal
                    courseId={course.id}
                    courseSlug={course.slug}
                    offer={offer}
                    priceQuote={priceQuote}
                    userId={session.userId}
                    userName={account?.rows[0]?.name || session.email}
                    userEmail={session.email}
                    userPhone={phone}
                    buttonLabel={hasFreeTier ? "Unlock PRO" : "Buy Now"}
                    modalTitle={hasFreeTier ? "Unlock PRO access" : "Get instant access"}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
