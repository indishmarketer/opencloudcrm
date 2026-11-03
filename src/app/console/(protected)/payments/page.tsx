import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getRazorpayKeyId } from "@/lib/razorpay";
import { getPaypalClientId } from "@/lib/paypal";
import {
  getDirectoryListingPrice,
  MAX_LISTING_PRICE_USD,
  MIN_LISTING_PRICE_USD,
} from "@/lib/directoryListingPrice";
import ConsolePaymentsSettings from "@/components/ConsolePaymentsSettings";

export const metadata = { title: "Payments | Console" };

type Transaction = {
  kind: "course" | "listing";
  reference: string | null;
  label: string;
  method: string;
  amount: number;
  currency: string;
  created_at: Date;
  refunded: boolean;
  buyer: string | null;
};

const money = (amount: number, currency: string) =>
  currency === "INR"
    ? `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
    : `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const day = (value: Date) =>
  new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * Money, in one place.
 *
 * The owner's complaint was that nothing in the console dealt with
 * payments: he could not see what had been charged and could not change
 * the one price that is not attached to a course. Course prices stay in
 * Course Studio, where the rest of a course lives, so this page covers the
 * directory listing fee, which gateways are actually wired up, and a
 * combined ledger of both kinds of payment.
 */
export default async function ConsolePaymentsPage() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) redirect("/console/login");

  const [listingPrice, courseRows, listingRows, totals] = await Promise.all([
    getDirectoryListingPrice(),
    pool.query<Transaction>(
      `SELECT 'course' AS kind, pc.reference, c.title AS label, pc.method,
              pc.amount::float AS amount, pc.currency, pc.created_at,
              pc.refunded_at IS NOT NULL AS refunded, u.email AS buyer
       FROM payment_claims pc
       JOIN courses c ON c.id = pc.course_id
       LEFT JOIN users u ON u.id = pc.user_id
       WHERE pc.status = 'approved' AND pc.amount IS NOT NULL
       ORDER BY pc.created_at DESC
       LIMIT 50`,
    ),
    pool.query<Transaction>(
      `SELECT 'listing' AS kind, t.payment_reference AS reference,
              t.name || ' (directory listing)' AS label,
              COALESCE(o.provider, 'unknown') AS method,
              (t.paid_amount_cents::float / 100) AS amount,
              COALESCE(t.paid_currency, 'USD') AS currency,
              t.paid_at AS created_at, false AS refunded, u.email AS buyer
       FROM directory_tools t
       LEFT JOIN users u ON u.id = t.submitted_by_user_id
       LEFT JOIN directory_listing_orders o
              ON o.tool_id = t.id AND o.status = 'paid'
       WHERE t.paid_at IS NOT NULL AND t.paid_amount_cents IS NOT NULL
       ORDER BY t.paid_at DESC
       LIMIT 50`,
    ),
    pool.query<{ currency: string; course_total: string; listing_total: string }>(
      `SELECT currency,
              SUM(course_total)::text AS course_total,
              SUM(listing_total)::text AS listing_total
       FROM (
         SELECT currency, SUM(amount) AS course_total, 0 AS listing_total
         FROM payment_claims
         WHERE status = 'approved' AND amount IS NOT NULL AND refunded_at IS NULL
         GROUP BY currency
         UNION ALL
         SELECT COALESCE(paid_currency, 'USD') AS currency, 0 AS course_total,
                SUM(paid_amount_cents) / 100.0 AS listing_total
         FROM directory_tools
         WHERE paid_at IS NOT NULL AND paid_amount_cents IS NOT NULL
         GROUP BY COALESCE(paid_currency, 'USD')
       ) AS combined
       GROUP BY currency
       ORDER BY currency`,
    ),
  ]);

  const transactions = [...courseRows.rows, ...listingRows.rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const razorpayReady = Boolean(getRazorpayKeyId());
  const paypalReady = Boolean(getPaypalClientId());
  const paypalSandbox = process.env.PAYPAL_ENV === "sandbox";

  // Unpaid paid-tier listings: money sitting on the table, and the thing
  // most worth chasing on this page.
  const awaiting = await pool.query<{ id: number; name: string; status: string; email: string | null }>(
    `SELECT t.id, t.name, t.status, u.email
     FROM directory_tools t LEFT JOIN users u ON u.id = t.submitted_by_user_id
     WHERE t.listing_tier = 'paid' AND t.paid_at IS NULL
       AND t.status IN ('pending', 'approved_unpaid')
     ORDER BY t.created_at DESC`,
  );

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Payments</h1>
      <p className="mt-2 text-sm text-ink-soft">
        What has been charged, which gateways are live, and the one price that is not attached to a
        course. Course prices live with the course, in{" "}
        <Link href="/console/courses" className="underline underline-offset-2">
          Course Studio
        </Link>
        .
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {totals.rows.length === 0 ? (
          <div className="rounded-2xl border border-line p-5">
            <p className="text-sm text-ink-soft">No payments yet.</p>
          </div>
        ) : (
          totals.rows.map((row) => {
            const courses = Number(row.course_total);
            const listings = Number(row.listing_total);
            return (
              <div key={row.currency} className="rounded-2xl border border-line p-5">
                <p className="text-xs uppercase tracking-wider text-ink-soft">
                  Collected in {row.currency}
                </p>
                <p className="mt-1 font-display text-2xl font-semibold">
                  {money(courses + listings, row.currency)}
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  {money(courses, row.currency)} courses · {money(listings, row.currency)} listings
                </p>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-8">
        <ConsolePaymentsSettings
          initialPriceUsd={listingPrice.usd}
          inrPreview={listingPrice.prices.inr}
          min={MIN_LISTING_PRICE_USD}
          max={MAX_LISTING_PRICE_USD}
        />
      </div>

      <section className="mt-8 rounded-2xl border border-line p-6">
        <h2 className="font-display text-lg font-semibold">Gateways</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Read-only. Keys live in Coolify as environment variables, not in the database, so changing
          one needs a redeploy.
        </p>
        <ul className="mt-4 space-y-3 text-sm">
          <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">Razorpay</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                razorpayReady ? "bg-ink text-paper" : "border border-red-600 text-red-600"
              }`}
            >
              {razorpayReady ? "Configured" : "Not configured"}
            </span>
            <span className="text-ink-soft">Charges INR. Used for Indian accounts.</span>
          </li>
          <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">PayPal</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                paypalReady ? "bg-ink text-paper" : "border border-red-600 text-red-600"
              }`}
            >
              {paypalReady ? "Configured" : "Not configured"}
            </span>
            {paypalSandbox && (
              <span className="rounded-full border border-red-600 px-2.5 py-0.5 text-xs font-medium text-red-600">
                Sandbox: no real money
              </span>
            )}
            <span className="text-ink-soft">Charges USD. Used for everyone else.</span>
          </li>
        </ul>
        <p className="mt-4 text-xs text-ink-soft">
          Refunds are issued in the Razorpay or PayPal dashboard, not here. There is no refund API
          call wired up, deliberately: a mis-click in the console should not be able to move money.
        </p>
      </section>

      {awaiting.rows.length > 0 && (
        <section className="mt-8 rounded-2xl border border-ink p-6">
          <h2 className="font-display text-lg font-semibold">Paid listings not yet paid for</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Someone chose the paid tier and did not finish checkout. They can still pay from My
            tools, and the submit page offers it to them again.
          </p>
          <ul className="mt-4 divide-y divide-line text-sm">
            {awaiting.rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-ink-soft">{row.email || "no account email"}</p>
                </div>
                <span className="text-xs text-ink-soft">
                  {row.status === "approved_unpaid" ? "Approved, payment due" : "Waiting for review"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">Recent payments</h2>
        {transactions.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">Nothing charged yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-soft">
                  <th className="pb-2 pr-4 font-medium">Date</th>
                  <th className="pb-2 pr-4 font-medium">What</th>
                  <th className="pb-2 pr-4 font-medium">Buyer</th>
                  <th className="pb-2 pr-4 font-medium">Via</th>
                  <th className="pb-2 pr-4 font-medium">Reference</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {transactions.map((row) => (
                  <tr key={`${row.kind}-${row.reference}-${row.created_at}`}>
                    <td className="py-3 pr-4 whitespace-nowrap text-ink-soft">{day(row.created_at)}</td>
                    <td className="py-3 pr-4">{row.label}</td>
                    <td className="py-3 pr-4 text-ink-soft">{row.buyer || "—"}</td>
                    <td className="py-3 pr-4 capitalize text-ink-soft">{row.method}</td>
                    <td className="py-3 pr-4 break-all text-xs text-ink-soft">{row.reference || "—"}</td>
                    <td className="py-3 text-right font-medium">
                      {money(row.amount, row.currency)}
                      {row.refunded && <span className="ml-2 text-xs text-red-600">Refunded</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-ink-soft">
          Newest 50 of each kind. Razorpay and PayPal remain the record of truth for the charge
          itself; these rows are our own copy, written only after the provider confirmed it.
        </p>
      </section>
    </div>
  );
}
