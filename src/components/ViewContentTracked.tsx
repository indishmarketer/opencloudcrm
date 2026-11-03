"use client";

import { useEffect } from "react";
import { trackMetaEvent } from "@/lib/metaPixel";

/** Fires Meta's ViewContent once per page load for a course landing page. */
export default function ViewContentTracked({
  courseSlug,
  courseTitle,
  price,
  currency,
}: {
  courseSlug: string;
  courseTitle: string;
  /** The price this visitor is shown, in the currency they would pay. */
  price: number | null;
  currency: "INR" | "USD";
}) {
  useEffect(() => {
    trackMetaEvent("ViewContent", {
      content_ids: [courseSlug],
      content_name: courseTitle,
      content_type: "product",
      ...(price != null ? { currency, value: price } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per mount
  }, []);

  return null;
}
