import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { STATUS_LABELS } from "@/lib/directoryFields";
import DirectoryBadgeSnippet from "@/components/DirectoryBadgeSnippet";
import DirectoryListingCheckout from "@/components/DirectoryListingCheckout";
import { getCheckoutRegion, accountPhone } from "@/lib/checkoutRegion";
import { createPriceQuote } from "@/lib/priceQuote";
import { getDirectoryListingPrice, formatListingPrice } from "@/lib/directoryListingPrice";
import { getRazorpayKeyId } from "@/lib/razorpay";
import { getPaypalClientId } from "@/lib/paypal";

export const metadata = { title: "My tools" };

const SENT: Record<string, string> = {
  edit: "Edit request sent. Your listing stays as it is until we approve it, and we'll email you.",
  resubmitted: "Thanks. Your tool is back in review and we'll email you.",
};

export default async function MyToolsPage({ searchParams }: { searchParams: Promise<{ sent?: string; paid?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login?redirect=/account/tools");
  const { sent, paid } = await searchParams;

  const result = await pool.query(
    `SELECT t.id, t.slug, t.name, t.tagline, t.logo_url, t.status, t.review_note, t.paid_at,
            t.paid_amount_cents, t.paid_currency, c.slug AS category_slug,
            t.listing_tier, t.backlink_verified_at, t.backlink_checked_at, t.backlink_error,
            (SELECT e.status FROM directory_tool_edits e WHERE e.tool_id = t.id ORDER BY e.created_at DESC LIMIT 1) AS last_edit_status,
            (SELECT e.admin_note FROM directory_tool_edits e WHERE e.tool_id = t.id ORDER BY e.created_at DESC LIMIT 1) AS last_edit_note
     FROM directory_tools t JOIN directory_categories c ON c.id = t.category_id
     WHERE t.submitted_by_user_id = $1
     ORDER BY t.created_at DESC`,
    [session.userId]
  );
  const tools = result.rows;
  const [identity, phone, region] = await Promise.all([
    pool.query<{ name: string | null }>("SELECT name FROM users WHERE id = $1", [session.userId]),
    accountPhone(session.userId),
    getCheckoutRegion(session.userId),
  ]);
  const listingPrice = await getDirectoryListingPrice();
  const pricing = listingPrice.prices;
  const priceLabel = formatListingPrice(listingPrice.usd, "USD");
  const razorpayKeyId = getRazorpayKeyId();
  const paypalClientId = getPaypalClientId();

  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <p className="text-sm text-ink-soft">
        <Link href="/account" className="hover:text-ink">Your account</Link> / My tools
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl font-semibold">My tools</h1>
        <Link href="/tools/submit" className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:opacity-80">
          Submit a tool
        </Link>
      </div>
      <p className="mt-3 text-ink-soft">
        Tools you submitted to the directory. You can update a tool when we ask for changes, and ask us to edit a tool once it&apos;s live.
      </p>
      {sent && SENT[sent] && <p className="mt-6 rounded-xl border border-ink p-4 text-sm">{SENT[sent]}</p>}
      {/* Deliberately not "your listing is live": a listing paid for during
          the submit flow has not been reviewed yet, so the status on the
          card below is the honest answer in both cases. */}
      {paid === "1" && (
        <p className="mt-6 rounded-xl border border-ink p-4 text-sm">
          Payment confirmed. The receipt is in{" "}
          <Link href="/account?tab=settings" className="underline underline-offset-2">
            Settings &amp; billing
          </Link>
          . Your listing&apos;s current status is on its card below.
        </p>
      )}

      <div className="mt-8 space-y-3">
        {tools.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-10 text-center">
            <p className="font-display text-lg font-semibold">No tools yet</p>
            <p className="mt-2 text-sm text-ink-soft">Built something marketers should know about? Submit it for review.</p>
          </div>
        )}
        {tools.map((t) => (
          <div key={t.id} className="rounded-2xl border border-line p-5">
            <div className="flex items-start gap-3">
              {t.logo_url ? (
                <SafeImage src={t.logo_url} alt={`${t.name} logo`} width={44} height={44} className="h-11 w-11 shrink-0 rounded-lg border border-line" />
              ) : (
                <div className="h-11 w-11 shrink-0 rounded-lg border border-line bg-paper-soft" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{t.name}</p>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      t.status === "published"
                        ? "bg-ink text-paper"
                        : t.status === "approved_unpaid"
                        ? "border border-ink text-ink"
                        : t.status === "changes_requested"
                        ? "border border-red-600 text-red-600"
                        : "bg-paper-soft text-ink-soft"
                    }`}
                  >
                    {t.listing_tier === "paid" && <span className="mr-1">Paid</span>}
                    {STATUS_LABELS[t.status] || t.status}
                  </span>
                </div>
                {t.tagline && <p className="mt-0.5 truncate text-sm text-ink-soft">{t.tagline}</p>}

                {t.status === "changes_requested" && t.review_note && (
                  <div className="mt-3 rounded-lg bg-paper-soft p-3 text-sm">
                    <p className="font-medium">What we need from you</p>
                    <p className="mt-1 whitespace-pre-line text-ink-soft">{t.review_note}</p>
                  </div>
                )}
                {t.status === "rejected" && t.review_note && (
                  <p className="mt-3 whitespace-pre-line text-sm text-ink-soft">{t.review_note}</p>
                )}
                {/* Payable both before and after review: the submit flow
                    now offers checkout straight after submitting, and this
                    is where somebody who skipped it comes back to. */}
                {t.listing_tier === "paid" && !t.paid_at && (t.status === "approved_unpaid" || t.status === "pending") && (
                  <div className="mt-4 rounded-xl border border-line bg-paper-soft p-4">
                    <p className="text-sm font-medium">
                      {t.status === "approved_unpaid"
                        ? "Approved. Complete the one-time listing payment to publish."
                        : `Pay the one-time ${priceLabel} fee to move this to the front of the review queue. Refunded in full if we cannot list it.`}
                    </p>
                    {region.method === "razorpay" && razorpayKeyId ? (
                      <DirectoryListingCheckout
                        toolId={t.id}
                        toolName={t.name}
                        method="razorpay"
                        amount={pricing.inr || 0}
                        currency="INR"
                        quote={createPriceQuote(t.id, pricing)}
                        razorpayKeyId={razorpayKeyId}
                        paypalClientId={null}
                        name={identity.rows[0]?.name || ""}
                        email={session.email}
                        phone={phone}
                      />
                    ) : region.method === "paypal" && paypalClientId ? (
                      <DirectoryListingCheckout
                        toolId={t.id}
                        toolName={t.name}
                        method="paypal"
                        amount={listingPrice.usd}
                        currency="USD"
                        quote={null}
                        razorpayKeyId={null}
                        paypalClientId={paypalClientId}
                        name={identity.rows[0]?.name || ""}
                        email={session.email}
                        phone={phone}
                      />
                    ) : (
                      <p className="mt-2 text-sm text-ink-soft">Online payment is not available right now. Contact support and we will help complete your listing.</p>
                    )}
                  </div>
                )}
                {t.listing_tier === "paid" && t.paid_at && t.status !== "published" && t.status !== "rejected" && (
                  <p className="mt-3 text-sm text-ink-soft">
                    <span className="font-medium text-ink">Paid.</span> You are in the priority
                    review queue. We&apos;ll email you when it&apos;s live, or refund you if we
                    can&apos;t list it.
                  </p>
                )}
                {/* The free tier is conditional on a reciprocal link, so
                    the badge and the current state of our check belong
                    right here, not buried in an email they have to find. */}
                {t.listing_tier === "free" && t.status !== "published" && t.status !== "rejected" && (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm">
                      {t.backlink_verified_at ? (
                        <span className="font-medium">Badge found on your site. Nothing else needed from you.</span>
                      ) : t.backlink_checked_at ? (
                        <>
                          <span className="font-medium text-red-600">We looked and could not find the badge.</span>
                          {t.backlink_error ? <span className="text-ink-soft"> {t.backlink_error}</span> : null}
                        </>
                      ) : (
                        <span className="text-ink-soft">
                          Add the badge below to your site and we will check for it during review.
                        </span>
                      )}
                    </p>
                    {!t.backlink_verified_at && (
                      <DirectoryBadgeSnippet categorySlug={t.category_slug} slug={t.slug} toolName={t.name} />
                    )}
                  </div>
                )}
                {t.status === "published" && t.last_edit_status === "pending" && (
                  <p className="mt-2 text-sm text-ink-soft">Your edit request is waiting for review.</p>
                )}
                {t.status === "published" && t.last_edit_status === "rejected" && t.last_edit_note && (
                  <p className="mt-2 text-sm text-ink-soft">Last edit request declined: {t.last_edit_note}</p>
                )}

                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  {t.status === "changes_requested" && (
                    <Link href={`/account/tools/${t.id}`} className="rounded-full bg-ink px-4 py-2 font-medium text-paper hover:opacity-80">
                      Update submission
                    </Link>
                  )}
                  {t.status === "published" && (
                    <>
                      <Link href={`/tools/${t.category_slug}/${t.slug}`} className="font-medium underline">
                        View listing
                      </Link>
                      {t.last_edit_status !== "pending" && (
                        <Link href={`/account/tools/${t.id}`} className="font-medium underline">
                          Request an edit
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
