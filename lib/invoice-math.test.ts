import { describe, expect, it } from "vitest"
import {
  checkCreditLimit,
  computeDueIncrement,
  computeLineTotals,
  computePaymentStatus,
  decrementStock,
} from "./invoice-math"

describe("decrementStock", () => {
  it("succeeds and returns the reduced stock when there's enough", () => {
    const result = decrementStock(100, 1, "Berger Paint 20L")
    expect(result).toEqual({ ok: true, newStock: 99 })
  })

  it("succeeds at the exact boundary (qty === stock)", () => {
    const result = decrementStock(5, 5, "Putty Blade")
    expect(result.ok).toBe(true)
    expect(result.newStock).toBe(0)
  })

  it("rejects when qty exceeds stock and leaves stock unchanged", () => {
    const result = decrementStock(5, 6, "Sanding Paper")
    expect(result.ok).toBe(false)
    expect(result.newStock).toBe(5)
    expect(result.error).toBe("Insufficient stock for Sanding Paper")
  })
})

describe("computePaymentStatus", () => {
  it("is 'paid' when amount paid covers the total exactly", () => {
    expect(computePaymentStatus(500, 500)).toBe("paid")
  })

  it("is 'paid' on overpayment too", () => {
    expect(computePaymentStatus(500, 600)).toBe("paid")
  })

  it("is 'partial' when something but not everything was paid", () => {
    expect(computePaymentStatus(500, 200)).toBe("partial")
  })

  it("is 'unpaid' when nothing was paid", () => {
    expect(computePaymentStatus(500, 0)).toBe("unpaid")
  })
})

describe("computeDueIncrement", () => {
  it("is total minus amount paid", () => {
    expect(computeDueIncrement(500, 200)).toBe(300)
  })

  it("is zero (or negative) when fully paid", () => {
    expect(computeDueIncrement(500, 500)).toBe(0)
    expect(computeDueIncrement(500, 600)).toBe(-100)
  })
})

describe("checkCreditLimit", () => {
  it("allows a sale that stays under the limit", () => {
    const result = checkCreditLimit(300, 200, 1000)
    expect(result).toEqual({ ok: true, newDue: 500 })
  })

  it("allows a sale that lands exactly on the limit (strict > boundary)", () => {
    const result = checkCreditLimit(0, 1000, 1000)
    expect(result.ok).toBe(true)
    expect(result.newDue).toBe(1000)
  })

  it("rejects a sale that would exceed the limit by even a rupee", () => {
    const result = checkCreditLimit(0, 1001, 1000)
    expect(result.ok).toBe(false)
    expect(result.newDue).toBe(0)
    expect(result.error).toBe("Credit limit exceeded: due would be 1001, limit is 1000")
  })

  it("never rejects when credit_limit is 0 (no limit set)", () => {
    const result = checkCreditLimit(50000, 999999, 0)
    expect(result.ok).toBe(true)
    expect(result.newDue).toBe(1049999)
  })
})

describe("computeLineTotals", () => {
  it("sums subtotal and GST across mixed-rate lines", () => {
    const { subtotal, gstTotal } = computeLineTotals([
      { unitPrice: 100, qty: 2, gstRate: 18 }, // 200 subtotal, 36 gst
      { unitPrice: 50, qty: 1, gstRate: 12 }, // 50 subtotal, 6 gst
    ])
    expect(subtotal).toBe(250)
    expect(gstTotal).toBeCloseTo(42, 5)
  })

  it("returns zero totals for an empty cart", () => {
    expect(computeLineTotals([])).toEqual({ subtotal: 0, gstTotal: 0 })
  })

  it("handles a 0% GST item (e.g. hardware with no GST configured)", () => {
    const { subtotal, gstTotal } = computeLineTotals([{ unitPrice: 25, qty: 4, gstRate: 0 }])
    expect(subtotal).toBe(100)
    expect(gstTotal).toBe(0)
  })
})
