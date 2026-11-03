import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getCourseBySlug, getUserEnrollment } from "@/lib/courses";
import UnlockedStatus from "@/components/UnlockedStatus";
import { getPublicContactEmail } from "@/lib/businessProfile";
import PurchaseTracked from "@/components/PurchaseTracked";

export const metadata = { title: "Payment received" };

export default async function CourseUnlockedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?redirect=${encodeURIComponent(`/account/courses/${slug}/unlocked`)}`);

  const course = await getCourseBySlug(slug);
  if (!course) notFound();

  const enrollment = await getUserEnrollment(session.userId, course.id);
  const isPro = enrollment?.tier === "pro";

  // Real charged amount/currency, not the course's list price -- these can
  // diverge (live INR->USD conversion, a manually-granted access with no
  // real charge) and ad platforms need the actual transaction value to
  // optimize spend, not a guess.
  const lastPayment = isPro
    ? (
        await pool.query(
          `SELECT id, amount, currency FROM payment_claims
           WHERE user_id = $1 AND course_id = $2 AND status = 'approved' AND amount IS NOT NULL
             AND currency IS NOT NULL AND refunded_at IS NULL
           ORDER BY created_at DESC LIMIT 1`,
          [session.userId, course.id]
        )
      ).rows[0]
    : null;

  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      {isPro ? (
        <>
          {lastPayment && (
            <PurchaseTracked
              claimId={lastPayment.id}
              courseSlug={course.slug}
              courseTitle={course.title}
              value={Number(lastPayment.amount)}
              currency={lastPayment.currency}
            />
          )}
          <h1 className="font-display text-3xl font-semibold">You&apos;re in!</h1>
          <p className="mt-3 text-sm text-ink-soft">
            Payment received. Every module of {course.title} is unlocked, and so is the PRO community, where
            you can ask questions and talk with other PRO members.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={`/account/courses/${course.slug}`}
              className="inline-block rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80"
            >
              Start learning
            </Link>
            <Link
              href="/community/pro"
              className="inline-block rounded-full border border-line px-6 py-3 text-sm font-medium transition-colors hover:border-ink"
            >
              Join the PRO community
            </Link>
          </div>
        </>
      ) : (
        <UnlockedStatus courseSlug={course.slug} courseTitle={course.title} supportEmail={await getPublicContactEmail()} />
      )}
    </div>
  );
}
