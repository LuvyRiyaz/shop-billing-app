import { describe, expect, it } from "vitest"
import { slugify } from "./staff"

describe("slugify", () => {
  it("lowercases and strips spaces/punctuation", () => {
    expect(slugify("Syed Traders")).toBe("syedtraders")
  })

  it("strips special characters", () => {
    expect(slugify("Firoz's Paints & Co.")).toBe("firozspaintsco")
  })

  it("falls back to 'shop' for a name with no alphanumeric characters", () => {
    expect(slugify("!!!")).toBe("shop")
  })

  it("truncates very long shop names to 24 characters", () => {
    const result = slugify("A Very Long Shop Name That Goes On And On")
    expect(result.length).toBeLessThanOrEqual(24)
  })
})
