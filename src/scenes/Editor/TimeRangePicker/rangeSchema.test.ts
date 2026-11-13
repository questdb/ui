import { describe, expect, it } from "vitest"
import { timeRangeSchema } from "./rangeSchema"

const validate = (dateFrom: string, dateTo: string) =>
  timeRangeSchema().validate({ dateFrom, dateTo }).error?.message ?? null

describe("timeRangeSchema", () => {
  it("accepts an aligned to bound that ends later today", () => {
    // Given / When / Then
    expect(validate("now/d", "now/d")).toBeNull()
    expect(validate("now-1d/d", "now-1d/d")).toBeNull()
    expect(validate("now/w", "now")).toBeNull()
  })

  it("still rejects an absolute date in the future", () => {
    // Given
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString()
    // When / Then
    expect(validate("now-1h", tomorrow)).toContain("in the past")
  })

  it("names the token grammar when a bound is unreadable", () => {
    // Given / When / Then
    expect(validate("now/x", "now")).toContain("now/d")
  })

  it("keeps the ordering rule for aligned bounds", () => {
    // Given / When / Then
    expect(validate("now", "now-1d/d")).toContain("From date must be before")
  })
})
