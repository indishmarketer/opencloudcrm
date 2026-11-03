import Link from "next/link";
import ModuleNotConfigured from "@/components/ModuleNotConfigured";
import { FEATURES } from "@/config/features";
import { conversationCost, type WhatsAppCost } from "@/lib/whatsappTemplates";
import { whatsappTotals, pricingStats, type PricingStat } from "@/lib/whatsappAnalytics";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90];

const CATEGORY_LABELS: Record<string, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utility",
  AUTHENTICATION: "Authentication",
  SERVICE: "Service",
  UNKNOWN: "Uncategorised",
};

// Official WhatsApp Cloud API base rates for India (+91) in INR per delivered message.
// Used for live estimation of recent/today's messages before Meta settles its daily billing report.
const ESTIMATED_RATES_INR: Record<string, number> = {
  MARKETING: 0.8631,
  UTILITY: 0.115,
  AUTHENTICATION: 0.115,
  SERVICE: 0,
};

function money(amount: number, currency: string | null): string {
  const curr = currency || "INR";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: curr }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${curr}`;
  }
}

export default async function WhatsAppCostPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  if (!FEATURES.whatsapp) {
    return <ModuleNotConfigured title="WhatsApp isn't connected yet" envVars={["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_WABA_ID"]} />;
  }

  const requested = Number((await searchParams).days);
  const days = RANGES.includes(requested) ? requested : 30;

  let cost: WhatsAppCost = { currency: "INR", byCategory: [], total: 0 };
  let totals = { outbound: 0, delivered: 0, read: 0, failed: 0, inbound: 0, conversations: 0 };
  let pricing: PricingStat[] = [];
  let error = "";

  const [costRes, totalsRes, pricingRes] = await Promise.allSettled([
    conversationCost(days),
    whatsappTotals(days),
    pricingStats(days),
  ]);

  if (costRes.status === "fulfilled") {
    cost = costRes.value;
  } else {
    error = costRes.reason instanceof Error ? costRes.reason.message : "Could not reach WhatsApp.";
  }

  if (totalsRes.status === "fulfilled") {
    totals = totalsRes.value;
  }

  if (pricingRes.status === "fulfilled") {
    pricing = pricingRes.value;
  }

  // Combine category data: Meta settled cost + local message count + live pending
  const categoryMap = new Map<string, { count: number; cost: number; settledCost: number; liveCost: number }>();

  // 1. Initialise with local DB counts
  for (const p of pricing) {
    const cat = (p.pricing_category || "UNKNOWN").toUpperCase();
    const count = (p.billable || 0) + (p.free || 0);
    const existing = categoryMap.get(cat) || { count: 0, cost: 0, settledCost: 0, liveCost: 0 };
    categoryMap.set(cat, { ...existing, count: existing.count + count });
  }

  // 2. Merge Meta settled data
  for (const c of cost.byCategory) {
    const cat = (c.category || "UNKNOWN").toUpperCase();
    const existing = categoryMap.get(cat) || { count: 0, cost: 0, settledCost: 0, liveCost: 0 };
    const metaCount = c.volume || 0;
    categoryMap.set(cat, {
      ...existing,
      count: Math.max(existing.count, metaCount),
      settledCost: c.cost,
      cost: c.cost,
    });
  }

  // 3. For any live / unsettled messages in DB that exceed Meta's settled volume, add live estimate
  let totalLivePending = 0;
  for (const p of pricing) {
    const cat = (p.pricing_category || "UNKNOWN").toUpperCase();
    const billable = p.billable || 0;
    const metaRow = cost.byCategory.find((c) => (c.category || "").toUpperCase() === cat);
    const metaVolume = metaRow?.volume || 0;
    const rate = ESTIMATED_RATES_INR[cat] ?? 0;

    if (billable > metaVolume) {
      const unsettledCount = billable - metaVolume;
      const liveAdd = unsettledCount * rate;
      totalLivePending += liveAdd;
      const existing = categoryMap.get(cat) || { count: billable, cost: 0, settledCost: 0, liveCost: 0 };
      categoryMap.set(cat, {
        ...existing,
        liveCost: liveAdd,
        cost: existing.settledCost + liveAdd,
      });
    } else if (!metaRow && billable > 0) {
      // Sent today before Meta returned any data point for this category
      const liveAdd = billable * rate;
      totalLivePending += liveAdd;
      const existing = categoryMap.get(cat) || { count: billable, cost: 0, settledCost: 0, liveCost: 0 };
      categoryMap.set(cat, {
        ...existing,
        liveCost: liveAdd,
        cost: liveAdd,
      });
    }
  }

  const standardCats = ["MARKETING", "UTILITY", "AUTHENTICATION", "SERVICE"];
  const allCatKeys = Array.from(new Set([...standardCats, ...categoryMap.keys()]));

  const rows = allCatKeys
    .map((cat) => ({
      category: cat,
      count: categoryMap.get(cat)?.count || 0,
      cost: categoryMap.get(cat)?.cost || 0,
      settledCost: categoryMap.get(cat)?.settledCost || 0,
      liveCost: categoryMap.get(cat)?.liveCost || 0,
    }))
    .filter((r) => r.count > 0 || r.cost > 0 || cost.byCategory.length > 0);

  const displayTotal = Math.max(cost.total + totalLivePending, rows.reduce((s, r) => s + r.cost, 0));
  const displaySentCount = Math.max(totals.outbound, rows.reduce((s, r) => s + r.count, 0));

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <div className="flex gap-2">
          {RANGES.map((range) => (
            <Link
              key={range}
              href={`/console/whatsapp/cost?days=${range}`}
              className={`rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                range === days ? "bg-ink text-paper" : "border border-line text-ink-soft hover:border-ink"
              }`}
            >
              {range} days
            </Link>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-2xl border border-line bg-paper-soft p-6 text-sm text-red-600">Could not reach WhatsApp: {error}</p>
      )}

      {/* Two summary cards: Total Cost & Messages Sent */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-line bg-paper p-6">
          <p className="text-xs text-ink-soft">Total cost, last {days} days</p>
          <p className="mt-1 font-display text-3xl font-semibold">{money(displayTotal, cost.currency)}</p>
          <p className="mt-2 text-xs text-ink-soft">
            {totalLivePending > 0
              ? `${money(cost.total, cost.currency)} billed · ${money(totalLivePending, cost.currency)} live estimate`
              : cost.total > 0
                ? "Official billed amount from Meta Cloud API."
                : "Service conversations under 1,000/mo are free."}
          </p>
        </section>

        <section className="rounded-2xl border border-line bg-paper p-6">
          <p className="text-xs text-ink-soft">Messages sent, last {days} days</p>
          <p className="mt-1 font-display text-3xl font-semibold">{displaySentCount.toLocaleString()}</p>
          <p className="mt-2 text-xs text-ink-soft">
            {totals.delivered.toLocaleString()} delivered · {totals.read.toLocaleString()} read
          </p>
        </section>
      </div>

      {/* Breakdown by category */}
      <section className="rounded-2xl border border-line bg-paper p-6">
        <h2 className="font-display text-lg font-semibold">By category</h2>
        <p className="mt-1 text-sm text-ink-soft">
          What drove the total -- marketing and utility are usually the ones worth watching.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-soft">
              <tr>
                <th className="py-2 pr-4 font-medium">Category</th>
                <th className="py-2 pr-4 font-medium">Messages sent</th>
                <th className="py-2 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.category} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4 font-medium">{CATEGORY_LABELS[row.category] || row.category}</td>
                  <td className="py-2 pr-4 text-ink-soft">{row.count.toLocaleString()}</td>
                  <td className="py-2">
                    {money(row.cost, cost.currency)}
                    {row.liveCost > 0 && (
                      <span className="ml-2 text-xs text-ink-soft font-normal">
                        ({money(row.settledCost, cost.currency)} billed + {money(row.liveCost, cost.currency)} live)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-3 text-ink-soft">
                    Nothing billed or sent in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
