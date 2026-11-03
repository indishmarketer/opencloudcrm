import { pool } from "@/lib/db";
import { LeadsChart, RevenueChart } from "@/components/DashboardCharts";

function toSeries(rows: { day: Date; value: string | number }[]) {
  return rows.map((r) => ({ day: new Date(r.day).toISOString(), value: Number(r.value) }));
}

/** Leads, revenue and conversion. Lived under Contacts as a tab called
 * "Dashboard" until 2026-10-22, which put money numbers inside a CRM
 * record screen and gave them a name that said nothing about what they
 * are. */
export default async function SalesPage() {
  const [leads, revenue, conversion, courseBreakdown] = await Promise.all([
    pool.query(`
      SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS value
      FROM attribution_events
      WHERE event_type IN ('contact','newsletter','product_lead','signup')
        AND created_at >= now() - interval '30 days'
      GROUP BY day ORDER BY day
    `),
    pool.query(`
      SELECT date_trunc('day', created_at) AS day, currency, SUM(amount) AS value
      FROM payment_claims
      WHERE status = 'approved' AND amount IS NOT NULL AND created_at >= now() - interval '30 days'
      GROUP BY day, currency ORDER BY day
    `),
    pool.query(`
      SELECT
        (SELECT COUNT(DISTINCT COALESCE(user_id::text, email)) FROM attribution_events WHERE created_at >= now() - interval '30 days') AS total_contacts,
        (SELECT COUNT(DISTINCT user_id) FROM payment_claims WHERE status = 'approved' AND created_at >= now() - interval '30 days') AS paying_contacts
    `),
    pool.query(`
      SELECT c.title, pc.currency, COUNT(*)::int AS count, SUM(pc.amount) AS revenue
      FROM payment_claims pc JOIN courses c ON c.id = pc.course_id
      WHERE pc.status = 'approved' AND pc.amount IS NOT NULL
      GROUP BY c.title, pc.currency
      ORDER BY revenue DESC
    `),
  ]);

  const leadsSeries = toSeries(leads.rows);
  const revenueByCurrency = new Map<string, { day: string; value: number }[]>();
  for (const row of revenue.rows) {
    const currency = row.currency || "unknown";
    const series = revenueByCurrency.get(currency) || [];
    series.push({ day: new Date(row.day).toISOString(), value: Number(row.value) });
    revenueByCurrency.set(currency, series);
  }

  const { total_contacts, paying_contacts } = conversion.rows[0];
  const conversionRate = total_contacts > 0 ? ((paying_contacts / total_contacts) * 100).toFixed(1) : "0.0";

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Sales</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Leads, revenue and conversion over the last 30 days. Always live on load.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-paper p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Contacts (30d)</p>
          <p className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{total_contacts}</p>
        </div>
        <div className="rounded-2xl border border-line bg-paper p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Conversion to paid (30d)</p>
          <p className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{conversionRate}%</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-paper p-4 sm:p-6">
        <h2 className="font-display text-lg font-semibold">Leads over time</h2>
        <div className="mt-4">
          <LeadsChart data={leadsSeries} />
        </div>
      </div>

      {[...revenueByCurrency.entries()].map(([currency, series]) => (
        <div key={currency} className="mt-6 rounded-2xl border border-line bg-paper p-4 sm:p-6">
          <h2 className="font-display text-lg font-semibold">Revenue over time ({currency})</h2>
          <div className="mt-4">
            <RevenueChart data={series} currency={currency} />
          </div>
        </div>
      ))}

      <div className="mt-6 rounded-2xl border border-line bg-paper p-4 sm:p-6">
        <h2 className="font-display text-lg font-semibold">Revenue by course</h2>
        {courseBreakdown.rows.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No approved payments recorded yet.</p>
        ) : (
          <div className="mt-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[22rem] text-left text-sm">
            <thead className="border-b border-line text-ink-soft">
              <tr>
                <th className="py-2 pr-4 font-medium">Course</th>
                <th className="py-2 pr-4 font-medium">Sales</th>
                <th className="py-2 pr-4 font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {courseBreakdown.rows.map((r, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4">{r.title}</td>
                  <td className="py-2 pr-4">{r.count}</td>
                  <td className="py-2 pr-4">
                    {r.currency === "INR" ? "₹" : "$"}
                    {r.revenue}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
