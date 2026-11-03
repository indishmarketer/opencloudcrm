import Link from "next/link";
import DirectoryListingCheckout from "@/components/DirectoryListingCheckout";
import type { SubmitCheckout } from "@/components/ToolSubmitForm";
import { STATUS_LABELS } from "@/lib/directoryFields";

export type InProgressListing = {
  id: number;
  name: string;
  status: string;
  listing_tier: "free" | "paid";
  paid_at: string | Date | null;
  category_slug: string;
  slug: string;
};

/**
 * "You already have one of these in flight" at the top of /tools/submit.
 *
 * The case this exists for: somebody picks the paid tier, submits, does not
 * finish checkout, wanders off, and comes back later. The draft is cleared
 * on a successful submit (correctly -- the listing exists now), so the form
 * started them at step one and the only thing waiting for them at the end
 * was a duplicate-name rejection. The listing and its unpaid fee were
 * already sitting in the database; this surfaces them instead, with the
 * checkout attached, so finishing the payment is one click from where they
 * landed.
 *
 * It does not block a second submission. One person can own several tools,
 * and the form is still right there underneath.
 */
export default function DirectoryListingInProgress({
  listings,
  checkout,
  priceLabel,
}: {
  listings: InProgressListing[];
  checkout: SubmitCheckout | null;
  priceLabel: string;
}) {
  if (listings.length === 0) return null;

  return (
    <section className="mb-8 rounded-3xl border border-ink p-5 sm:p-6">
      <h2 className="font-display text-lg font-semibold">You have a submission in progress</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Pick up where you left off. Submitting the same tool again will not create a second
        listing.
      </p>

      <ul className="mt-5 space-y-4">
        {listings.map((listing) => {
          const owesPayment =
            listing.listing_tier === "paid" &&
            !listing.paid_at &&
            (listing.status === "pending" || listing.status === "approved_unpaid");
          return (
            <li key={listing.id} className="rounded-2xl border border-line bg-paper-soft p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="font-medium">{listing.name}</p>
                <span className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-xs text-ink-soft">
                  {listing.listing_tier === "paid" ? "Paid tier" : "Free tier"}
                  {" · "}
                  {STATUS_LABELS[listing.status] || listing.status}
                </span>
              </div>

              {owesPayment ? (
                <>
                  <p className="mt-2 text-sm text-ink-soft">
                    {listing.status === "approved_unpaid"
                      ? `Approved. Pay the one-time ${priceLabel} fee to publish it.`
                      : `The one-time ${priceLabel} fee is still unpaid. Pay it to move this to the front of the review queue. Refunded in full if we cannot list it.`}
                  </p>
                  {checkout?.method ? (
                    <DirectoryListingCheckout
                      toolId={listing.id}
                      toolName={listing.name}
                      method={checkout.method}
                      amount={checkout.amount}
                      currency={checkout.currency}
                      quote={null}
                      razorpayKeyId={checkout.razorpayKeyId}
                      paypalClientId={checkout.paypalClientId}
                      name={checkout.name}
                      email={checkout.email}
                      phone={checkout.phone}
                    />
                  ) : (
                    <p className="mt-2 text-sm text-ink-soft">
                      Online payment is not available right now.{" "}
                      <Link href="/contact" className="underline underline-offset-2 hover:text-ink">
                        Contact us
                      </Link>{" "}
                      and we will finish the listing for you.
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-ink-soft">
                  {listing.status === "changes_requested"
                    ? "We asked for some changes before this can go live."
                    : listing.listing_tier === "paid" && listing.paid_at
                    ? "Paid. You are in the priority review queue and we will email you."
                    : "Waiting for review. We will email you when it is live."}
                </p>
              )}

              <Link
                href={
                  listing.status === "changes_requested"
                    ? `/account/tools/${listing.id}`
                    : "/account/tools"
                }
                className="mt-3 inline-block text-xs font-medium underline underline-offset-2 hover:text-ink"
              >
                {listing.status === "changes_requested" ? "Make the changes" : "Manage it in My tools"}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
