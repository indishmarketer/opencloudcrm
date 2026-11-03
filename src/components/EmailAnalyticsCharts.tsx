"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const INK = "#0a0a0a";
const SOFT = "#9a9a96";
const GRID = "#e2e2e0";
const AXIS = "#4b4b4b";

type DailyPoint = { day: string; sent: number; opened: number; clicked: number };

function formatDay(day: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function EmailDailyChart({ data }: { data: DailyPoint[] }) {
  if (data.every((d) => d.sent === 0 && d.opened === 0 && d.clicked === 0)) {
    return <p className="py-10 text-center text-sm text-ink-soft">No email activity in this period.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="day" tickFormatter={formatDay} stroke={GRID} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} minTickGap={24} />
        <YAxis stroke={GRID} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} width={40} allowDecimals={false} />
        <Tooltip
          labelFormatter={(label) => formatDay(String(label))}
          contentStyle={{ borderRadius: 8, border: `1px solid ${GRID}`, fontSize: 13 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="sent" name="Sent" stroke={SOFT} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="opened" name="Opened" stroke={INK} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="clicked" name="Clicked" stroke={INK} strokeWidth={2} strokeDasharray="5 4" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function OpensByHourChart({ data }: { data: { hour: number; opens: number }[] }) {
  if (data.every((d) => d.opens === 0)) {
    return <p className="py-10 text-center text-sm text-ink-soft">No opens in this period.</p>;
  }
  const label = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? "am" : "pm"}`;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="hour" tickFormatter={label} stroke={GRID} tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} interval={2} />
        <YAxis stroke={GRID} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} width={32} allowDecimals={false} />
        <Tooltip
          labelFormatter={(hour) => `${label(Number(hour))} India time`}
          formatter={(value) => [value, "Opened"]}
          contentStyle={{ borderRadius: 8, border: `1px solid ${GRID}`, fontSize: 13 }}
        />
        <Bar dataKey="opens" fill={INK} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
