// Smart reorder/expiry alerts, shared between the billing screen
// (components/billing/SmartAlertsBanner.tsx) and the owner reports
// dashboard (app/(owner)/reports/page.tsx) — one set of rules computed
// once, not two copies that could drift.

import { toDate } from "./reports"
import type { ProductRecord } from "./types/pocketbase"

export interface StockAlerts {
  /** stock_qty <= reorder_level (reorder_level > 0 — see POCKETBASE_SETUP.md §3) */
  critical: ProductRecord[]
  /** stock_qty <= low_stock_threshold, and not already critical */
  warning: ProductRecord[]
}

export function getStockAlerts(products: ProductRecord[]): StockAlerts {
  const critical: ProductRecord[] = []
  const warning: ProductRecord[] = []

  for (const p of products) {
    if (!p.is_active) continue

    const isCritical = p.reorder_level > 0 && p.stock_qty <= p.reorder_level
    if (isCritical) {
      critical.push(p)
      continue
    }

    if (p.stock_qty <= p.low_stock_threshold) {
      warning.push(p)
    }
  }

  critical.sort((a, b) => a.stock_qty - b.stock_qty)
  warning.sort((a, b) => a.stock_qty - b.stock_qty)
  return { critical, warning }
}

export interface ExpiryAlerts {
  /** expiry_date already in the past */
  expired: ProductRecord[]
  /** expiry_date within the next N days (default 30), not yet expired */
  expiringSoon: ProductRecord[]
}

const DAY_MS = 24 * 60 * 60 * 1000

export function getExpiryAlerts(
  products: ProductRecord[],
  now: Date = new Date(),
  windowDays = 30
): ExpiryAlerts {
  const expired: ProductRecord[] = []
  const expiringSoon: ProductRecord[] = []

  for (const p of products) {
    if (!p.is_active || !p.expiry_date) continue

    const expiry = toDate(p.expiry_date)
    if (Number.isNaN(expiry.getTime())) continue

    const diffDays = (expiry.getTime() - now.getTime()) / DAY_MS
    if (diffDays < 0) {
      expired.push(p)
    } else if (diffDays <= windowDays) {
      expiringSoon.push(p)
    }
  }

  const byExpiry = (a: ProductRecord, b: ProductRecord) =>
    toDate(a.expiry_date!).getTime() - toDate(b.expiry_date!).getTime()
  expired.sort(byExpiry)
  expiringSoon.sort(byExpiry)

  return { expired, expiringSoon }
}
