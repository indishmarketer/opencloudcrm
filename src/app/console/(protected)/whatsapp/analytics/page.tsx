import Link from "next/link";
import ModuleNotConfigured from "@/components/ModuleNotConfigured";
import { FEATURES } from "@/config/features";
import {
  campaignStats,
  consentCounts,
  pricingStats,
  templateStats,
  whatsappTotals,
} from "@/lib/whatsappAnalytics";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90];

function percent(part: number, whole: number): string {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

export default async function WhatsAppAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  if (!FEATURES.whatsapp) return <ModuleNotConfigured title="WhatsApp isn't connected yet" envVars={["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_WABA_ID"]} />;

  const requested = Number((await searchParams).days);
  const days = RANGES.includes(requested) ? requested : 30;

  const [totals, templates, campaigns, pricing, consent] = await Promise.all([
    whatsappTotals(days),
    templateStats(days),
    campaignStats(days),
    pricingStats(days),
    consentCounts(),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-soft">
          Everything sent and received on WhatsApp, from the message log. Delivered and read come from WhatsApp&apos;s
          own delivery reports.
        </p>
        <div className="flex gap-2">
          {RANGES.map((range) => (
            <Link
              key={range}
              href={`/console/whatsapp/analytics?days=${range}`}
              className={`rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                range === days ? "bg-ink text-paper" : "border border-line text-ink-soft hover:border-ink"
              }`}
            >
              {range} days
            </Link>
          ))}
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Sent", value: totals.outbound, hint: `${totals.conversations} conversation${totals.conversations === 1 ? "" : "s"}` },
          { label: "Delivered", value: totals.delivered, hint: `${percent(totals.delivered, totals.outbound)} of sent` },
          { label: "Read", value: totals.read, hint: `${percent(totals.read, totals.delivered)} of delivered` },
          { label: "Failed", value: totals.failed, hint: totals.failed ? "Open the inbox for the reason" : "None" },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-line bg-paper p-5">
            <p className="text-xs text-ink-soft">{card.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold">{card.value}</p>
            <p className="mt-1 text-xs text-ink-soft">{card.hint}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-line bg-paper p-6">
        <h2 className="font-display text-lg font-semibold">Who can be reached</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Consent is per channel: this is WhatsApp only, and says nothing about email. Marketing needs an explicit
          opt-in; a message about something the person just did does not.
        </p>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-ink-soft">Opted in</p>
            <p className="font-medium">{consent.subscribed}</p>
          </div>
          <div>
            <p className="text-xs text-ink-soft">Opted in with a number</p>
            <p className="font-medium">{consent.reachable}</p>
          </div>
          <div>
            <p className="text-xs text-ink-soft">Never asked</p>
            <p className="font-medium">{consent.unknown}</p>
          </div>
          <div>
            <p className="text-xs text-ink-soft">Opted out</p>
            <p className="font-medium">{consent.unsubscribed}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          Inbound in this period: {totals.inbound} message{totals.inbound === 1 ? "" : "s"}.
        </p>
      </section>

      <section className="rounded-2xl border border-line bg-paper p-6">
        <h2 className="font-display text-lg font-semibold">Templates</h2>
        <p className="mt-1 text-sm text-ink-soft">Which messages actually land and get read.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-soft">
              <tr>
                <th className="py-2 pr-4 font-medium">Template</th>
                <th className="py-2 pr-4 font-medium">Sent</th>
                <th className="py-2 pr-4 font-medium">Delivered</th>
                <th className="py-2 pr-4 font-medium">Read</th>
                <th className="py-2 font-medium">Failed</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((row) => (
                <tr key={row.template_name} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4">{row.template_name}</td>
                  <td className="py-2 pr-4">{row.sent}</td>
                  <td className="py-2 pr-4">
                    {row.delivered} <span className="text-xs text-ink-soft">{percent(row.delivered, row.sent)}</span>
                  </td>
                  <td className="py-2 pr-4">
                    {row.read} <span className="text-xs text-ink-soft">{percent(row.read, row.sent)}</span>
                  </td>
                  <td className="py-2">{row.failed}</td>
                </tr>
              ))}
              {templates.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-ink-soft">
                    No template messages in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          Sends made before this reporting existed have no template recorded against them, so they are missing from
          this table while still counted in the totals above.
        </p>
      </section>

      <section className="rounded-2xl border border-line bg-paper p-6">
        <h2 className="font-display text-lg font-semibold">Campaigns</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-soft">
              <tr>
                <th className="py-2 pr-4 font-medium">Campaign</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Sent</th>
                <th className="py-2 pr-4 font-medium">Delivered</th>
                <th className="py-2 pr-4 font-medium">Read</th>
                <th className="py-2 font-medium">Failed</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4">{row.name}</td>
                  <td className="py-2 pr-4 capitalize">{row.status.replace(/_/g, " ")}</td>
                  <td className="py-2 pr-4">{row.sent}</td>
                  <td className="py-2 pr-4">
                    {row.delivered} <span className="text-xs text-ink-soft">{percent(row.delivered, row.sent)}</span>
                  </td>
                  <td className="py-2 pr-4">
                    {row.read} <span className="text-xs text-ink-soft">{percent(row.read, row.sent)}</span>
                  </td>
                  <td className="py-2">{row.failed}</td>
                </tr>
              ))}
              {campaigns.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 text-ink-soft">
                    No campaigns in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-paper p-6">
        <h2 className="font-display text-lg font-semibold">What WhatsApp charged for</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Counts by the category WhatsApp billed each message under, as reported on its own delivery receipts. No
          amount is shown on purpose: the rate depends on the message category and the recipient&apos;s country and
          changes over time, so a figure worked out here would be a guess. The real total is on Meta&apos;s billing
          page.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-soft">
              <tr>
                <th className="py-2 pr-4 font-medium">Category</th>
                <th className="py-2 pr-4 font-medium">Billable</th>
                <th className="py-2 font-medium">Free</th>
              </tr>
            </thead>
            <tbody>
              {pricing.map((row) => (
                <tr key={row.pricing_category || "unknown"} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4 capitalize">{row.pricing_category || "unknown"}</td>
                  <td className="py-2 pr-4">{row.billable}</td>
                  <td className="py-2">{row.free}</td>
                </tr>
              ))}
              {pricing.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-3 text-ink-soft">
                    Nothing reported yet. WhatsApp attaches this to a message&apos;s delivery receipt, so it appears
                    once new messages are delivered.
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
