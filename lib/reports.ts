// Pure aggregation helpers for the owner/manager reports dashboard.
// Deliberately in-memory reductions over a `getFullList()` result rather
// than DB-side SUM/GROUP BY — PocketBase's record API has no aggregation
// endpoint, and a single shop's daily/monthly invoice volume is small
// enough that this is simpler than standing up a custom aggregation route.

import type { CustomerRecord, InvoiceRecord, InvoiceItemRecord, ProductRecord } from "./types/pocketbase"

// Date-boundary helpers used to live here as several standalone
// startOfXISO() functions; they're now unified into resolveDateRange()
// below (e.g. resolveDateRange("today")) so there's one place that computes
// "today"/"this month"/etc., not three independent ones that could drift.

/**
 * Local calendar-day key (`YYYY-MM-DD`) using the Date's own
 * getFullYear/getMonth/getDate — deliberately NOT `.toISOString().slice(0,10)`,
 * which renders in UTC and would mislabel every bucket by a day for any
 * server timezone east of UTC (e.g. IST, UTC+5:30: local midnight Jan 15 is
 * "2024-01-14T18:30:00.000Z", so slicing the ISO string gives the 14th).
 */
function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * PocketBase serializes dates as `"YYYY-MM-DD HH:mm:ss.sssZ"` (a space
 * between date and time, confirmed from tools/types/datetime.go's
 * `DefaultDateLayout`), not the `T`-separated ISO 8601 that
 * `Date.toISOString()` produces. Comparing those two string shapes with
 * plain `>=`/`<=` is wrong — for the same calendar day, `'T' > ' '`
 * lexicographically, so a raw string compare against a `toISOString()`
 * boundary would silently exclude today's own records. Normalize to `T`
 * before constructing a `Date` so comparisons are reliable.
 */
export function toDate(pocketBaseDateString: string): Date {
  return new Date(pocketBaseDateString.replace(" ", "T"))
}

export interface CollectionSummary {
  invoiceCount: number
  totalBilled: number
  totalCollected: number
  byMode: Record<string, number>
}

export function summarizeCollections(invoices: InvoiceRecord[]): CollectionSummary {
  const byMode: Record<string, number> = {}
  let totalBilled = 0
  let totalCollected = 0

  for (const inv of invoices) {
    totalBilled += inv.total
    totalCollected += inv.amount_paid
    byMode[inv.payment_mode] = (byMode[inv.payment_mode] || 0) + inv.amount_paid
  }

  return { invoiceCount: invoices.length, totalBilled, totalCollected, byMode }
}

export interface GstSummary {
  taxable: number
  cgst: number
  sgst: number
  igst: number
}

export function summarizeGst(invoices: InvoiceRecord[]): GstSummary {
  return invoices.reduce(
    (acc, inv) => ({
      taxable: acc.taxable + inv.subtotal,
      cgst: acc.cgst + inv.cgst,
      sgst: acc.sgst + inv.sgst,
      igst: acc.igst + inv.igst,
    }),
    { taxable: 0, cgst: 0, sgst: 0, igst: 0 }
  )
}

export interface ProfitSummary {
  revenue: number
  cost: number
  profit: number
  marginPct: number
}

/**
 * Approximate — uses each product's CURRENT cost_price, not a historical
 * snapshot (invoice_items doesn't store cost_price at sale time), so this
 * shifts if cost prices changed since the sale. Good enough for a
 * directional "are we profitable this month" card, not for audited
 * accounting.
 */
export function summarizeProfit(
  items: Array<InvoiceItemRecord & { expand?: { product_id?: ProductRecord } }>
): ProfitSummary {
  let revenue = 0
  let cost = 0

  for (const item of items) {
    revenue += item.line_total
    const costPrice = item.expand?.product_id?.cost_price ?? 0
    cost += costPrice * item.qty
  }

  const profit = revenue - cost
  const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0
  return { revenue, cost, profit, marginPct }
}

export interface SalesmanSummary {
  salesman: string
  invoiceCount: number
  total: number
}

export function summarizeBySalesman(invoices: InvoiceRecord[]): SalesmanSummary[] {
  const byName = new Map<string, SalesmanSummary>()

  for (const inv of invoices) {
    const name = inv.salesman?.trim()
    if (!name) continue
    const existing = byName.get(name)
    if (existing) {
      existing.invoiceCount += 1
      existing.total += inv.total
    } else {
      byName.set(name, { salesman: name, invoiceCount: 1, total: inv.total })
    }
  }

  return Array.from(byName.values()).sort((a, b) => b.total - a.total)
}

export interface CreditSummary {
  totalDue: number
  customersWithDue: number
  top: CustomerRecord[]
}

export function summarizeOutstandingCredit(customers: CustomerRecord[]): CreditSummary {
  const withDue = customers.filter((c) => c.current_due > 0)
  const totalDue = withDue.reduce((sum, c) => sum + c.current_due, 0)
  const top = [...withDue].sort((a, b) => b.current_due - a.current_due).slice(0, 5)
  return { totalDue, customersWithDue: withDue.length, top }
}

export function sumRevenue(invoices: InvoiceRecord[]): number {
  return invoices.reduce((sum, inv) => sum + inv.total, 0)
}

// ─── Date-range filter (app/(owner)/reports/page.tsx) ──────────────────────
// Superseded the old fixed "trailing 7 days" sparkline (summarizeLast7DaysRevenue)
// — summarizeRevenueOverTime below generalizes it to any selected range.

export type DateRangePreset = "today" | "week" | "month" | "last_month" | "year" | "custom"

export interface DateRange {
  start: Date
  /** Exclusive upper bound. */
  end: Date
  label: string
}

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + days)
  return copy
}

/**
 * Parses an `<input type="date">` value ("YYYY-MM-DD") as a LOCAL calendar
 * date. Deliberately NOT `new Date("YYYY-MM-DD")` — a bare date-only ISO
 * string is parsed as UTC midnight per spec, which combined with any
 * subsequent local-time math (setHours, etc.) can land on the wrong
 * calendar day depending on the server's timezone relative to UTC. The
 * 3-argument Date constructor is always local, so splitting the string
 * ourselves sidesteps the whole class of bug (the same one `toDate()` and
 * `localDateKey()` above exist to avoid).
 */
function parseLocalDateInput(value: string): Date {
  const [y, m, d] = value.split("-").map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

/**
 * Resolves a preset (or custom from/to) into concrete start/end bounds.
 * `end` is always exclusive, so callers do `created >= start && created < end`.
 * Known limitation shared with the rest of this file: boundaries are in the
 * Next.js SERVER's local timezone, not the shop's. If the server runs in
 * UTC (the Vercel default) while the shop is in IST (UTC+5:30), late-evening
 * sales can land in the "wrong" day's bucket. Fixing this properly means
 * storing a timezone on `shops` and doing the boundary math in it — out of
 * scope here, tracked rather than silently shipped.
 */
export function resolveDateRange(preset: DateRangePreset, customFrom?: string, customTo?: string): DateRange {
  const now = new Date()
  const todayStart = startOfDay(now)
  const tomorrowStart = addDays(todayStart, 1)

  switch (preset) {
    case "today":
      return { start: todayStart, end: tomorrowStart, label: "Today" }

    case "week": {
      // Monday-start week. getDay(): 0=Sun..6=Sat.
      const dow = todayStart.getDay()
      const diffToMonday = dow === 0 ? 6 : dow - 1
      return { start: addDays(todayStart, -diffToMonday), end: tomorrowStart, label: "This week" }
    }

    case "month":
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: tomorrowStart, label: "This month" }

    case "last_month":
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 1),
        label: "Last month",
      }

    case "year":
      return { start: new Date(now.getFullYear(), 0, 1), end: tomorrowStart, label: "This year" }

    case "custom": {
      if (!customFrom || !customTo) {
        // Incomplete custom range — fall back to "this month" rather than
        // an empty/undefined range.
        return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: tomorrowStart, label: "This month" }
      }
      const start = startOfDay(parseLocalDateInput(customFrom))
      // +1 day so the "to" date is inclusive (a date picker's end date means
      // "through the end of this day", not "up to its midnight").
      const end = addDays(startOfDay(parseLocalDateInput(customTo)), 1)
      return { start, end, label: `${customFrom} → ${customTo}` }
    }
  }
}

export interface RevenueTimePoint {
  key: string
  label: string
  revenue: number
}

/**
 * Buckets by day when the range is <= 31 days, by calendar month otherwise
 * — a "This Year" line chart with 365 daily points is unreadable, and a
 * "Today" chart bucketed by month is meaningless. Pass invoices already
 * fetched for exactly [start, end) — this only buckets what it's given.
 */
export function summarizeRevenueOverTime(invoices: InvoiceRecord[], start: Date, end: Date): RevenueTimePoint[] {
  const spanDays = (end.getTime() - start.getTime()) / DAY_MS
  const points: RevenueTimePoint[] = []

  if (spanDays > 31) {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
    while (cursor < end) {
      points.push({
        key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
        label: cursor.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
        revenue: 0,
      })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    const byKey = new Map(points.map((p) => [p.key, p]))
    for (const inv of invoices) {
      const d = toDate(inv.created)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const bucket = byKey.get(key)
      if (bucket) bucket.revenue += inv.total
    }
    return points
  }

  const cursor = new Date(start)
  while (cursor < end) {
    points.push({
      key: localDateKey(cursor),
      label: cursor.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      revenue: 0,
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  const byKey = new Map(points.map((p) => [p.key, p]))
  for (const inv of invoices) {
    const bucket = byKey.get(localDateKey(toDate(inv.created)))
    if (bucket) bucket.revenue += inv.total
  }
  return points
}

export interface TopProductPoint {
  name: string
  revenue: number
  qty: number
}

/** Ranked by revenue (line_total), not quantity — a "top seller" for a
 *  billing dashboard is about rupee impact, not unit count. Uses the
 *  product_name SNAPSHOT already stored on invoice_items (the same one
 *  the printed invoice uses), not a live product lookup. */
export function summarizeTopProducts(items: InvoiceItemRecord[], limit = 5): TopProductPoint[] {
  const byName = new Map<string, TopProductPoint>()

  for (const item of items) {
    const existing = byName.get(item.product_name)
    if (existing) {
      existing.revenue += item.line_total
      existing.qty += item.qty
    } else {
      byName.set(item.product_name, { name: item.product_name, revenue: item.line_total, qty: item.qty })
    }
  }

  return Array.from(byName.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
}

export const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  credit: "Credit",
}

export interface PaymentModePoint {
  mode: string
  label: string
  amount: number
}

/** Grouped by amount_paid (what was actually collected via that mode), not
 *  invoice total — an unpaid credit portion isn't "cash" or anything until
 *  it's actually collected, same reasoning as summarizeCollections. */
export function summarizePaymentModes(invoices: InvoiceRecord[]): PaymentModePoint[] {
  const byMode = new Map<string, number>()

  for (const inv of invoices) {
    byMode.set(inv.payment_mode, (byMode.get(inv.payment_mode) ?? 0) + inv.amount_paid)
  }

  return Array.from(byMode.entries())
    .filter(([, amount]) => amount > 0)
    .map(([mode, amount]) => ({ mode, label: PAYMENT_MODE_LABELS[mode] ?? mode, amount }))
    .sort((a, b) => b.amount - a.amount)
}

export interface InvoiceKpis {
  count: number
  avgBillValue: number
  totalTax: number
  totalDiscount: number
}

export function summarizeInvoiceKpis(invoices: InvoiceRecord[]): InvoiceKpis {
  const count = invoices.length
  const totalBilled = sumRevenue(invoices)
  const totalTax = invoices.reduce((sum, inv) => sum + inv.cgst + inv.sgst + inv.igst, 0)
  const totalDiscount = invoices.reduce((sum, inv) => sum + inv.discount, 0)
  return { count, avgBillValue: count > 0 ? totalBilled / count : 0, totalTax, totalDiscount }
}
