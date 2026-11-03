"use client";

import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type SeriesPoint = { day: string; value: number };

function formatDay(day: string) {
  return new Date(day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ConsoleOverviewChart({
  leadsData,
  revenueData,
}: {
  leadsData: SeriesPoint[];
  revenueData?: SeriesPoint[];
}) {
  // By default, always display the Leads & Sign-ups curve
  const [metric, setMetric] = useState<"leads" | "revenue">("leads");

  const activeData = metric === "revenue" && revenueData ? revenueData : leadsData;
  const total = activeData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold sm:text-xl">30-day growth curve</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            {metric === "revenue" ? `Total revenue: ₹${total.toLocaleString()}` : `Total new leads & sign-ups: ${total.toLocaleString()}`}
          </p>
        </div>
        {revenueData && revenueData.length > 0 && (
          <div className="flex rounded-full border border-line bg-paper-soft p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMetric("leads")}
              className={`rounded-full px-3 py-1 font-medium transition-colors ${
                metric === "leads" ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
              }`}
            >
              Leads &amp; Sign-ups
            </button>
            <button
              type="button"
              onClick={() => setMetric("revenue")}
              className={`rounded-full px-3 py-1 font-medium transition-colors ${
                metric === "revenue" ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
              }`}
            >
              Revenue
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 h-60 w-full">
        {activeData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-ink-soft">
            No activity recorded in the last 30 days.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={activeData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0a0a0a" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#0a0a0a" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e2e0" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="day"
                tickFormatter={formatDay}
                stroke="#e2e2e0"
                tick={{ fill: "#666", fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                stroke="#e2e2e0"
                tick={{ fill: "#666", fontSize: 11 }}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                formatter={(val) => [
                  metric === "revenue" ? `₹${Number(val).toLocaleString()}` : `${val} events`,
                  metric === "revenue" ? "Revenue" : "Events",
                ]}
                labelFormatter={(label) => formatDay(String(label))}
                contentStyle={{
                  backgroundColor: "#ffffff",
                  borderColor: "#e2e2e0",
                  borderRadius: "10px",
                  fontSize: "12px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#0a0a0a"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#curveGradient)"
                activeDot={{ r: 5, fill: "#0a0a0a" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
