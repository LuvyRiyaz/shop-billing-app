"use client"

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { RevenueTimePoint } from "@/lib/reports"

function formatAxisValue(v: number): string {
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}k`
  return `₹${v}`
}

/** Emerald — the semantic "revenue" color across this dashboard. Buckets
 *  (day vs month) are decided by lib/reports.ts's summarizeRevenueOverTime
 *  based on the selected date range's span. */
export function RevenueLineChart({ data }: { data: RevenueTimePoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--color-fg)", fillOpacity: 0.5 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-fg)", fillOpacity: 0.5 }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={formatAxisValue}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              borderRadius: 10,
              fontSize: 12,
              boxShadow: "var(--shadow-raised)",
            }}
            formatter={(value: number) => [`₹${value.toFixed(2)}`, "Revenue"]}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="var(--color-success)"
            strokeWidth={3}
            dot={{ r: 3, fill: "var(--color-success)", strokeWidth: 0 }}
            activeDot={{ r: 6, fill: "var(--color-success)", stroke: "var(--color-surface-raised)", strokeWidth: 2 }}
            animationDuration={800}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
