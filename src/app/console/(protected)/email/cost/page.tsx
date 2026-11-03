import Link from "next/link";
import { getMetrics, todayInIndia } from "@/lib/emailAnalytics";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90];

// Amazon SES has no cost-reporting API of its own -- the real billed figure
// only exists in AWS Cost Explorer, which needs a separate IAM permission
// (ce:GetCostAndUsage) this account's SES-only credential does not have.
// This is an estimate from our own send count instead: AWS's per-email rate
// is stable and published, unlike WhatsApp's category/country pricing, so a
// local calculation is reasonable here -- but AWS introduced a second
// pricing tier (Essentials, $0.16/1,000) on 2026-07-21, and this SES setup
// went live 2026-10-01, after that cutover. There is no way to tell from
// here which tier the account is actually billed on, so both are shown.
const RATES = [
  { name: "Standard (Pay-as-you-go)", perThousand: 0.1 },
  { name: "Essentials", perThousand: 0.16 },
];

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default async function EmailCostPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const requested = Number((await searchParams).days);
  const days = RANGES.includes(requested) ? requested : 30;

  const to = todayInIndia();
  const from = shiftDay(to, -days);
  const metrics = await getMetrics(from, to, "");

  const estimatedCost = (metrics.sent * 0.1) / 1000;

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <div className="flex gap-2">
          {RANGES.map((range) => (
            <Link
              key={range}
              href={`/console/email/cost?days=${range}`}
              className={`rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                range === days ? "bg-ink text-paper" : "border border-line text-ink-soft hover:border-ink"
              }`}
            >
              {range} days
            </Link>
          ))}
        </div>
      </div>

      {/* Two summary cards: Estimated Cost & Emails Sent */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-line bg-paper p-6">
          <p className="text-xs text-ink-soft">Estimated cost, last {days} days</p>
          <p className="mt-1 font-display text-3xl font-semibold">${estimatedCost.toFixed(2)}</p>
          <p className="mt-2 text-xs text-ink-soft">
            Based on standard AWS SES rate ($0.10 / 1,000 emails).
          </p>
        </section>

        <section className="rounded-2xl border border-line bg-paper p-6">
          <p className="text-xs text-ink-soft">Emails sent, last {days} days</p>
          <p className="mt-1 font-display text-3xl font-semibold">{metrics.sent.toLocaleString()}</p>
          <p className="mt-2 text-xs text-ink-soft">
            {metrics.delivered.toLocaleString()} delivered · {metrics.opened.toLocaleString()} opened
          </p>
        </section>
      </div>

      {/* Tier breakdown */}
      <section className="rounded-2xl border border-line bg-paper p-6">
        <h2 className="font-display text-lg font-semibold">Tier breakdown</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Shown at both of AWS&apos;s current SES pricing tiers, because which one this account bills under has not
          been confirmed yet.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-soft">
              <tr>
                <th className="py-2 pr-4 font-medium">Tier</th>
                <th className="py-2 pr-4 font-medium">Rate</th>
                <th className="py-2 font-medium">Estimated cost</th>
              </tr>
            </thead>
            <tbody>
              {RATES.map((rate) => (
                <tr key={rate.name} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4 font-medium">{rate.name}</td>
                  <td className="py-2 pr-4 text-ink-soft">${rate.perThousand.toFixed(2)} / 1,000 emails</td>
                  <td className="py-2">${((metrics.sent * rate.perThousand) / 1000).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          Does not include attachment data, dedicated IPs, or any monthly base fee a tier may carry -- check{" "}
          <a
            className="underline"
            href="https://us-east-1.console.aws.amazon.com/costmanagement/home#/custom-dashboard"
            target="_blank"
            rel="noreferrer"
          >
            AWS Billing
          </a>{" "}
          for the real number and to confirm which tier above actually applies.
        </p>
      </section>
    </div>
  );
}
