"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Seconds between automatic checks: quick at first (the normal case is a
// few seconds), then backing off. About 3 minutes in total.
const SCHEDULE = [2, 3, 3, 5, 5, 10, 10, 15, 15, 20, 30, 30, 30];

/** Payment succeeded at the provider, but access isn't granted yet (the
 * webhook can lag). Re-checks on its own, then hands the buyer a manual
 * "Check again" and a support contact instead of a page that silently
 * stops updating. */
export default function UnlockedStatus({
  courseSlug,
  courseTitle,
  supportEmail,
}: {
  courseSlug: string;
  courseTitle: string;
  supportEmail: string;
}) {
  const router = useRouter();
  const step = useRef(0);
  const [gaveUp, setGaveUp] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (gaveUp) return;
    if (step.current >= SCHEDULE.length) {
      setGaveUp(true);
      return;
    }
    const timer = setTimeout(() => {
      step.current += 1;
      router.refresh();
      // Re-run this effect for the next interval.
      setChecking((c) => !c);
    }, SCHEDULE[step.current] * 1000);
    return () => clearTimeout(timer);
  }, [router, gaveUp, checking]);

  const checkAgain = useCallback(() => {
    step.current = 0;
    setGaveUp(false);
    router.refresh();
  }, [router]);


  return (
    <>
      <h1 className="font-display text-3xl font-semibold">Payment received</h1>
      {gaveUp ? (
        <p className="mt-3 text-sm text-ink-soft">
          Your access to {courseTitle} is taking longer than usual. Your payment is safe and we have been alerted
          if anything went wrong. Check again in a minute, or email{" "}
          <a href={`mailto:${supportEmail}`} className="underline hover:text-ink">
            {supportEmail}
          </a>{" "}
          with your payment receipt and we will unlock it for you.
        </p>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">
          We&apos;re finalizing your access to {courseTitle}. This usually takes a few seconds. This page will
          update on its own.
        </p>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {gaveUp && (
          <button
            type="button"
            onClick={checkAgain}
            className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80"
          >
            Check again
          </button>
        )}
        <Link
          href={`/account/courses/${courseSlug}`}
          className="inline-block rounded-full border border-line px-6 py-3 text-sm font-medium transition-colors hover:border-ink"
        >
          Go to course
        </Link>
      </div>
    </>
  );
}
