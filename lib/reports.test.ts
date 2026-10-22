import { describe, expect, it } from "vitest"
import {
  resolveDateRange,
  summarizeInvoiceKpis,
  summarizePaymentModes,
  summarizeRevenueOverTime,
  summarizeTopProducts,
  sumRevenue,
} from "./reports"
import type { InvoiceItemRecord, InvoiceRecord } from "./types/pocketbase"

// Minimal fake invoice — only the fields these two functions touch.
function fakeInvoice(total: number, daysAgo: number): InvoiceRecord {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  // PocketBase's own date shape: space-separated, not ISO's "T" (see
  // reports.ts's toDate() doc comment for why this matters). toISOString()
  // already renders exactly 3 fractional-second digits, matching
  // PocketBase's "2006-01-02 15:04:05.000Z" layout once T becomes a space.
  const pbDate = d.toISOString().replace("T", " ")
  return { id: `inv_${daysAgo}_${total}`, total, created: pbDate } as InvoiceRecord
}

describe("sumRevenue", () => {
  it("sums invoice totals", () => {
    const invoices = [fakeInvoice(100, 0), fakeInvoice(250, 1)]
    expect(sumRevenue(invoices)).toBe(350)
  })

  it("is 0 for an empty list", () => {
    expect(sumRevenue([])).toBe(0)
  })
})

describe("resolveDateRange", () => {
  it("'today' spans exactly local midnight to midnight", () => {
    const { start, end } = resolveDateRange("today")
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000)
    expect(start.getHours()).toBe(0)
  })

  it("'week' starts on a Monday", () => {
    const { start } = resolveDateRange("week")
    expect(start.getDay()).toBe(1) // 1 = Monday
  })

  it("'month' starts on the 1st of the current month", () => {
    const { start } = resolveDateRange("month")
    const now = new Date()
    expect(start.getDate()).toBe(1)
    expect(start.getMonth()).toBe(now.getMonth())
  })

  it("'last_month' doesn't bleed into the current month", () => {
    const { start, end } = resolveDateRange("last_month")
    const now = new Date()
    const expectedEnd = new Date(now.getFullYear(), now.getMonth(), 1)
    expect(end.getTime()).toBe(expectedEnd.getTime())
    expect(start.getTime()).toBeLessThan(end.getTime())
  })

  it("custom range is inclusive of the 'to' date (parsed as local, not UTC)", () => {
    const { start, end } = resolveDateRange("custom", "2026-03-01", "2026-03-05")
    // local-midnight March 1 to local-midnight March 6 (one day past "to")
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(2) // March = index 2
    expect(start.getDate()).toBe(1)
    expect(end.getDate()).toBe(6)
  })

  it("falls back to 'this month' when custom range is incomplete", () => {
    const { label } = resolveDateRange("custom", "2026-03-01", undefined)
    expect(label).toBe("This month")
  })
})

describe("summarizeRevenueOverTime", () => {
  it("buckets by day for a short range", () => {
    const start = new Date(2026, 2, 1)
    const end = new Date(2026, 2, 6) // 5-day span
    const points = summarizeRevenueOverTime([], start, end)
    expect(points).toHaveLength(5)
  })

  it("buckets by month for a range longer than 31 days", () => {
    const start = new Date(2026, 0, 1)
    const end = new Date(2026, 5, 1) // Jan-May, ~151 days
    const points = summarizeRevenueOverTime([], start, end)
    expect(points).toHaveLength(5) // Jan, Feb, Mar, Apr, May
  })

  it("places an invoice's total in the correct day bucket", () => {
    const start = new Date(2026, 2, 1)
    const end = new Date(2026, 2, 4)
    const inv = { id: "i1", total: 500, created: "2026-03-02 10:00:00.000Z" } as InvoiceRecord
    const points = summarizeRevenueOverTime([inv], start, end)
    expect(points.reduce((s, p) => s + p.revenue, 0)).toBe(500)
  })
})

describe("summarizeTopProducts", () => {
  function fakeItem(name: string, lineTotal: number, qty: number): InvoiceItemRecord {
    return { id: `${name}-${Math.random()}`, product_name: name, line_total: lineTotal, qty } as InvoiceItemRecord
  }

  it("ranks by revenue, not quantity", () => {
    const items = [fakeItem("Cheap bulk item", 100, 50), fakeItem("Expensive item", 90, 2)]
    const top = summarizeTopProducts(items, 5)
    expect(top[0]!.name).toBe("Cheap bulk item")
  })

  it("aggregates repeated purchases of the same product across invoices", () => {
    const items = [fakeItem("Paint 20L", 500, 1), fakeItem("Paint 20L", 500, 1)]
    const top = summarizeTopProducts(items, 5)
    expect(top).toHaveLength(1)
    expect(top[0]!.revenue).toBe(1000)
    expect(top[0]!.qty).toBe(2)
  })

  it("respects the limit", () => {
    const items = Array.from({ length: 10 }, (_, i) => fakeItem(`Item ${i}`, i + 1, 1))
    expect(summarizeTopProducts(items, 5)).toHaveLength(5)
  })
})

describe("summarizePaymentModes", () => {
  function fakeInvoiceWithMode(mode: string, amountPaid: number): InvoiceRecord {
    return { id: `inv-${Math.random()}`, payment_mode: mode, amount_paid: amountPaid, total: amountPaid } as InvoiceRecord
  }

  it("groups by amount_paid, not total", () => {
    const invoices = [fakeInvoiceWithMode("cash", 100), fakeInvoiceWithMode("cash", 50), fakeInvoiceWithMode("upi", 200)]
    const modes = summarizePaymentModes(invoices)
    const cash = modes.find((m) => m.mode === "cash")
    expect(cash?.amount).toBe(150)
  })

  it("excludes a mode with 0 collected (e.g. a fully-unpaid credit sale)", () => {
    const invoices = [fakeInvoiceWithMode("credit", 0)]
    expect(summarizePaymentModes(invoices)).toHaveLength(0)
  })

  it("sorts descending by amount", () => {
    const invoices = [fakeInvoiceWithMode("cash", 50), fakeInvoiceWithMode("upi", 500)]
    const modes = summarizePaymentModes(invoices)
    expect(modes[0]!.mode).toBe("upi")
  })
})

describe("summarizeInvoiceKpis", () => {
  it("computes count, average, tax, and discount totals", () => {
    const invoices = [
      { id: "1", total: 100, cgst: 9, sgst: 9, igst: 0, discount: 5 },
      { id: "2", total: 200, cgst: 18, sgst: 18, igst: 0, discount: 0 },
    ] as InvoiceRecord[]

    const kpis = summarizeInvoiceKpis(invoices)
    expect(kpis.count).toBe(2)
    expect(kpis.avgBillValue).toBe(150)
    expect(kpis.totalTax).toBe(54)
    expect(kpis.totalDiscount).toBe(5)
  })

  it("avgBillValue is 0, not NaN, for an empty list", () => {
    expect(summarizeInvoiceKpis([]).avgBillValue).toBe(0)
  })
})
