"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const INK = "#0a0a0a";
const GRID = "#e2e2e0";
const AXIS = "#4b4b4b";

type SeriesPoint = { day: string; value: number };

function formatDay(day: string) {
  return new Date(day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function TrendChart({ data, valuePrefix }: { data: SeriesPoint[]; valuePrefix?: string }) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-soft">No data in this window yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="day"
          tickFormatter={formatDay}
          stroke={GRID}
          tick={{ fill: AXIS, fontSize: 12 }}
          tickLine={false}
        />
        <YAxis stroke={GRID} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} width={40} />
        <Tooltip
          formatter={(value) => [`${valuePrefix || ""}${value}`, ""]}
          labelFormatter={(label) => formatDay(String(label))}
          contentStyle={{ borderRadius: 8, border: `1px solid ${GRID}`, fontSize: 13 }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={INK}
          strokeWidth={2}
          dot={{ r: 3, fill: INK }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function LeadsChart({ data }: { data: SeriesPoint[] }) {
  return <TrendChart data={data} />;
}

export function RevenueChart({ data, currency }: { data: SeriesPoint[]; currency: string }) {
  return <TrendChart data={data} valuePrefix={currency === "INR" ? "₹" : "$"} />;
}
