"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trackEvent } from "@/lib/gtag";

/** Fires GA4 `course_enroll` once, only right after a fresh free enrollment
 * (see the ?enrolled=1 param set by /courses/[slug]/enroll), then strips
 * the param so a page refresh/revisit doesn't re-fire it. */
export default function EnrollTracked({ courseSlug }: { courseSlug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("enrolled") !== "1") return;
    trackEvent("course_enroll", { course: courseSlug, tier: "free" });
    router.replace(`/account/courses/${courseSlug}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once for this exact load, not on every param/router identity change
  }, []);

  return null;
}
