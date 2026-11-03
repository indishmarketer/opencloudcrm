"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/gtag";
import { trackMetaPixelEvent } from "@/lib/metaPixel";

/** Browser-side purchase conversion for the "You're in" page, keyed to the
 * real payment record (payment_claims.id):
 * - GA4 `purchase` uses it as transaction_id, so GA4 drops repeats.
 * - The Meta pixel uses event id `purchase-<claimId>`, the same id the
 *   server sent to the Conversions API when the payment was verified, so
 *   Meta merges them into one purchase. If this page never loads (tab
 *   closed), the server event still counts the sale.
 * Value/currency are what was actually charged, not the list price. */
export default function PurchaseTracked({
  claimId,
  courseSlug,
  courseTitle,
  value,
  currency,
}: {
  claimId: number;
  courseSlug: string;
  courseTitle: string;
  value: number;
  currency: string;
}) {
  useEffect(() => {
    const key = `im_purchase_tracked_${claimId}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      // storage blocked: GA4 and Meta still dedupe on the ids below
    }
    trackEvent("purchase", {
      transaction_id: String(claimId),
      value,
      currency,
      items: [{ item_id: courseSlug, item_name: courseTitle, price: value, quantity: 1 }],
    });
    trackMetaPixelEvent(
      "Purchase",
      {
        value,
        currency,
        order_id: String(claimId),
        content_ids: [courseSlug],
        content_name: courseTitle,
        content_type: "product",
      },
      `purchase-${claimId}`,
    );
  }, [claimId, courseSlug, courseTitle, value, currency]);

  return null;
}
