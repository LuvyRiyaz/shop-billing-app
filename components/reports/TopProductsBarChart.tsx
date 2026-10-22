"use client"

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { TopProductPoint } from "@/lib/reports"

/** Indigo→primary gradient — "indigo for invoices/sales volume" per the
 *  semantic color spec, distinct from the emerald used for raw revenue. */
export function TopProductsBarChart({ data }: { data: TopProductPoint[] }) {
  if (data.length === 0) {
    return <p className="flex h-64 items-center justify-center text-sm text-fg/40">No sales in this range yet.</p>
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="topProductFill" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--color-info)" />
              <stop offset="100%" stopColor="var(--color-primary)" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: "var(--color-fg)", fillOpacity: 0.5 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `₹${v}`}
          />
          <YAxis
            dataKey="name"
            type="category"
            width={110}
            tick={{ fontSize: 11, fill: "var(--color-fg)", fillOpacity: 0.7 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              borderRadius: 10,
              fontSize: 12,
              boxShadow: "var(--shadow-raised)",
            }}
            formatter={(value: number, _name, props) => [
              `₹${value.toFixed(2)} (${props.payload.qty} sold)`,
              "Revenue",
            ]}
          />
          <Bar dataKey="revenue" fill="url(#topProductFill)" radius={[0, 6, 6, 0]} maxBarSize={22} animationDuration={700} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
