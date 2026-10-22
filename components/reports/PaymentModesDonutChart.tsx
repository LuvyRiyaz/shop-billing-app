"use client"

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import type { PaymentModePoint } from "@/lib/reports"

const COLORS = ["var(--color-success)", "var(--color-info)", "var(--color-primary)", "var(--color-warning)"]

export function PaymentModesDonutChart({ data }: { data: PaymentModePoint[] }) {
  if (data.length === 0) {
    return <p className="flex h-64 items-center justify-center text-sm text-fg/40">No payments collected in this range yet.</p>
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="amount" nameKey="label" innerRadius="55%" outerRadius="80%" paddingAngle={3} animationDuration={700}>
            {data.map((entry, i) => (
              <Cell key={entry.mode} fill={COLORS[i % COLORS.length]} stroke="var(--color-surface)" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              borderRadius: 10,
              fontSize: 12,
              boxShadow: "var(--shadow-raised)",
            }}
            formatter={(value: number) => `₹${value.toFixed(2)}`}
          />
          <Legend
            verticalAlign="bottom"
            height={28}
            formatter={(value: string) => <span style={{ color: "var(--color-fg)", opacity: 0.7, fontSize: 12 }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
