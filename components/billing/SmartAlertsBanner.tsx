"use client"

import { useState } from "react"
import { getExpiryAlerts, getStockAlerts } from "@/lib/alerts"
import { toDate } from "@/lib/reports"
import type { ProductRecord } from "@/lib/types/pocketbase"

/**
 * Computed from the SAME live `products` state the billing screen already
 * keeps in sync via its realtime subscription (BillingScreen.tsx) — a sale
 * on another counter that pushes a product below its reorder level updates
 * this banner for free, no separate fetch/subscription needed.
 */
export function SmartAlertsBanner({ products }: { products: ProductRecord[] }) {
  const [expanded, setExpanded] = useState(false)
  const { critical, warning } = getStockAlerts(products)
  const { expired, expiringSoon } = getExpiryAlerts(products)

  const criticalCount = critical.length + expired.length
  const warningCount = warning.length + expiringSoon.length

  if (criticalCount === 0 && warningCount === 0) return null

  const tone = criticalCount > 0 ? "critical" : "warning"

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${
        tone === "critical" ? "border-danger/30 bg-danger/5" : "border-warning/30 bg-warning/5"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className={`font-medium ${tone === "critical" ? "text-danger" : "text-warning"}`}>
          {criticalCount > 0 && `${criticalCount} critical`}
          {criticalCount > 0 && warningCount > 0 && " · "}
          {warningCount > 0 && `${warningCount} warning`}
          {" — smart alerts"}
        </span>
        <span className="text-xs text-fg/40">{expanded ? "Hide" : "Show"}</span>
      </button>

      {expanded && (
        <div className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-2 text-xs">
          {critical.length > 0 && (
            <AlertRow label="Reorder now" tone="critical" items={critical.map((p) => `${p.name} (${p.stock_qty} ${p.unit} left)`)} />
          )}
          {expired.length > 0 && (
            <AlertRow
              label="Expired"
              tone="critical"
              items={expired.map((p) => `${p.name} (expired ${toDate(p.expiry_date!).toLocaleDateString("en-IN")})`)}
            />
          )}
          {warning.length > 0 && (
            <AlertRow label="Low stock" tone="warning" items={warning.map((p) => `${p.name} (${p.stock_qty} ${p.unit} left)`)} />
          )}
          {expiringSoon.length > 0 && (
            <AlertRow
              label="Expiring soon"
              tone="warning"
              items={expiringSoon.map((p) => `${p.name} (by ${toDate(p.expiry_date!).toLocaleDateString("en-IN")})`)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function AlertRow({ label, tone, items }: { label: string; tone: "critical" | "warning"; items: string[] }) {
  return (
    <div>
      <p className={`font-medium ${tone === "critical" ? "text-danger" : "text-warning"}`}>{label}</p>
      <ul className="mt-0.5 flex flex-col gap-0.5 text-fg/70">
        {items.slice(0, 5).map((item, i) => (
          <li key={i} className="truncate">
            {item}
          </li>
        ))}
        {items.length > 5 && <li className="text-fg/40">+{items.length - 5} more</li>}
      </ul>
    </div>
  )
}
