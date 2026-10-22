import { describe, expect, it } from "vitest"
import { getExpiryAlerts, getStockAlerts } from "./alerts"
import type { ProductRecord } from "./types/pocketbase"

function fakeProduct(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: "p1",
    name: "Test Product",
    is_active: true,
    stock_qty: 10,
    low_stock_threshold: 5,
    reorder_level: 0,
    unit: "nos",
    ...overrides,
  } as ProductRecord
}

describe("getStockAlerts", () => {
  it("is neither critical nor warning when stock is comfortably above both thresholds", () => {
    const { critical, warning } = getStockAlerts([fakeProduct({ stock_qty: 50 })])
    expect(critical).toHaveLength(0)
    expect(warning).toHaveLength(0)
  })

  it("is a warning when stock is at the low_stock_threshold boundary", () => {
    const { critical, warning } = getStockAlerts([fakeProduct({ stock_qty: 5, low_stock_threshold: 5, reorder_level: 0 })])
    expect(critical).toHaveLength(0)
    expect(warning).toHaveLength(1)
  })

  it("is critical, not also warning, when stock is at/below a configured reorder_level", () => {
    const { critical, warning } = getStockAlerts([
      fakeProduct({ stock_qty: 2, low_stock_threshold: 5, reorder_level: 3 }),
    ])
    expect(critical).toHaveLength(1)
    expect(warning).toHaveLength(0) // not double-counted
  })

  it("treats reorder_level = 0 as unconfigured — falls through to warning only", () => {
    const { critical, warning } = getStockAlerts([fakeProduct({ stock_qty: 0, low_stock_threshold: 5, reorder_level: 0 })])
    expect(critical).toHaveLength(0)
    expect(warning).toHaveLength(1)
  })

  it("ignores inactive products", () => {
    const { critical, warning } = getStockAlerts([fakeProduct({ stock_qty: 0, reorder_level: 10, is_active: false })])
    expect(critical).toHaveLength(0)
    expect(warning).toHaveLength(0)
  })

  it("sorts each tier by stock ascending", () => {
    const { warning } = getStockAlerts([
      fakeProduct({ id: "a", stock_qty: 4, low_stock_threshold: 5 }),
      fakeProduct({ id: "b", stock_qty: 1, low_stock_threshold: 5 }),
    ])
    expect(warning.map((p) => p.id)).toEqual(["b", "a"])
  })
})

describe("getExpiryAlerts", () => {
  const now = new Date("2026-01-15T00:00:00.000Z")

  it("ignores products with no expiry_date", () => {
    const { expired, expiringSoon } = getExpiryAlerts([fakeProduct({ expiry_date: undefined })], now)
    expect(expired).toHaveLength(0)
    expect(expiringSoon).toHaveLength(0)
  })

  it("flags a past date as expired, not expiring-soon", () => {
    const { expired, expiringSoon } = getExpiryAlerts(
      [fakeProduct({ expiry_date: "2026-01-01 00:00:00.000Z" })],
      now
    )
    expect(expired).toHaveLength(1)
    expect(expiringSoon).toHaveLength(0)
  })

  it("flags a date 29 days out as expiring soon (within the 30-day window)", () => {
    const { expired, expiringSoon } = getExpiryAlerts(
      [fakeProduct({ expiry_date: "2026-02-13 00:00:00.000Z" })],
      now
    )
    expect(expired).toHaveLength(0)
    expect(expiringSoon).toHaveLength(1)
  })

  it("does not flag a date 40 days out", () => {
    const { expired, expiringSoon } = getExpiryAlerts(
      [fakeProduct({ expiry_date: "2026-02-24 00:00:00.000Z" })],
      now
    )
    expect(expired).toHaveLength(0)
    expect(expiringSoon).toHaveLength(0)
  })

  it("ignores inactive products even if expired", () => {
    const { expired } = getExpiryAlerts(
      [fakeProduct({ expiry_date: "2020-01-01 00:00:00.000Z", is_active: false })],
      now
    )
    expect(expired).toHaveLength(0)
  })
})
