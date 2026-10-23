"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TicketStatus } from "@/config/statuses";

/** Brand-aligned single series colours (one hue per chart = no colour legend needed). */
const BLUE = "#3b82f6";
/** Chart colours come from CSS variables (globals.css) so they follow the light/dark theme. */
const AXIS = { fontSize: 11, fill: "var(--chart-axis)" };
const GRID = "var(--chart-grid)";

/** Status hues match the status badges used everywhere else. */
const STATUS_FILL: Record<TicketStatus, string> = {
  Submitted: "#94a3b8",
  Assigned: "#3b82f6",
  "In Progress": "#8b5cf6",
  Resolved: "#10b981",
  Closed: "var(--ink)",
  Reopened: "#f43f5e",
  Merged: "#a1a1aa",
};

function ChartTooltip({ active, payload, label, unit = "tickets" }: { active?: boolean; payload?: { value: number }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-bold text-foreground">{label}</p>
      <p className="text-muted-foreground">
        {payload[0].value} {unit}
      </p>
    </div>
  );
}

function Empty() {
  return <p className="grid h-full place-items-center text-sm text-slate-500">No tickets in this period</p>;
}

/** Horizontal bars, sorted by count — good for long category / building names. */
export function RankedBars({ data, height }: { data: { name: string; count: number }[]; height?: number }) {
  if (data.length === 0) return <div className="h-48"><Empty /></div>;
  const h = height ?? Math.max(160, data.length * 34 + 20);
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={130} tick={{ ...AXIS, fill: "var(--chart-axis-strong)" }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--chart-cursor)" }} />
          <Bar dataKey="count" fill={BLUE} radius={[0, 4, 4, 0]} maxBarSize={22}>
            <LabelList dataKey="count" position="right" style={{ fontSize: 11, fontWeight: 700, fill: "var(--chart-label)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DailyLine({ data }: { data: { day: string; count: number }[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="day" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip unit="new tickets" />} cursor={{ stroke: "var(--chart-axis)", strokeDasharray: "3 3" }} />
          <Line
            type="monotone"
            dataKey="count"
            stroke={BLUE}
            strokeWidth={2}
            dot={{ r: 3, fill: BLUE, stroke: "var(--chart-dot-stroke)", strokeWidth: 2 }}
            activeDot={{ r: 5, stroke: "var(--chart-dot-stroke)", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** One bar per status, coloured like the status badges and directly labelled. */
export function StatusBars({ data }: { data: { status: TicketStatus; count: number }[] }) {
  if (data.length === 0) return <div className="h-48"><Empty /></div>;
  const rows = data.map((d) => ({ name: d.status, count: d.count }));
  return (
    <div style={{ height: Math.max(160, rows.length * 34 + 20) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={90} tick={{ ...AXIS, fill: "var(--chart-axis-strong)" }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--chart-cursor)" }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {rows.map((r) => (
              <Cell key={r.name} fill={STATUS_FILL[r.name]} />
            ))}
            <LabelList dataKey="count" position="right" style={{ fontSize: 11, fontWeight: 700, fill: "var(--chart-label)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
