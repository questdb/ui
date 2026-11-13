import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { durationTokenToDate, isDateToken, parseRelativeToken } from "./utils"

describe("parseRelativeToken", () => {
  it("reads an offset, an alignment, or both", () => {
    // Given / When / Then
    expect(parseRelativeToken("now")).toEqual({ amount: 0, unit: "s" })
    expect(parseRelativeToken("now-6h")).toEqual({ amount: 6, unit: "h" })
    expect(parseRelativeToken("now/d")).toEqual({
      amount: 0,
      unit: "s",
      align: "d",
    })
    expect(parseRelativeToken("now-1d/d")).toEqual({
      amount: 1,
      unit: "d",
      align: "d",
    })
    expect(parseRelativeToken("now-1M/M")).toEqual({
      amount: 1,
      unit: "M",
      align: "M",
    })
  })

  it("rejects tokens outside the grammar", () => {
    // Given
    const invalid = ["now/x", "now/", "/d", "now+1d", "now-1d/dd", "yesterday"]
    // When / Then
    for (const token of invalid) {
      expect(parseRelativeToken(token), token).toBeNull()
      expect(isDateToken(token), token).toBe(false)
    }
  })
})

describe("durationTokenToDate", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // A Thursday, 08:24 UTC
    vi.setSystemTime(new Date("2026-09-17T08:24:36.000Z"))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const utc = (iso: string) => new Date(iso).getTime()
  const at = (token: string, edge: "from" | "to") =>
    new Date(durationTokenToDate(token, edge)).getTime()

  it("aligns a from bound to the start of the unit in the browser zone, UTC under test", () => {
    expect(at("now/d", "from")).toBe(utc("2026-09-17T00:00:00Z"))
    expect(at("now/w", "from")).toBe(utc("2026-09-14T00:00:00Z"))
    expect(at("now/M", "from")).toBe(utc("2026-09-01T00:00:00Z"))
    expect(at("now/y", "from")).toBe(utc("2026-01-01T00:00:00Z"))
  })

  it("aligns a to bound to the end of the unit", () => {
    expect(at("now/d", "to")).toBe(utc("2026-09-17T23:59:59Z"))
    expect(at("now-1d/d", "to")).toBe(utc("2026-09-16T23:59:59Z"))
    expect(at("now-1w/w", "to")).toBe(utc("2026-09-13T23:59:59Z"))
  })

  it("offsets by calendar months and years, not fixed seconds", () => {
    expect(at("now-1M", "to")).toBe(utc("2026-08-17T08:24:36Z"))
    expect(at("now-2y", "from")).toBe(utc("2024-09-17T08:24:36Z"))
  })

  it("leaves an unaligned token unchanged by the edge", () => {
    expect(at("now-1h", "from")).toBe(at("now-1h", "to"))
    expect(at("now", "to")).toBe(utc("2026-09-17T08:24:36Z"))
  })

  it("passes absolute dates through and flags garbage", () => {
    expect(durationTokenToDate("2026-01-10T09:30:00Z", "from")).toBe(
      "2026-01-10T09:30:00Z",
    )
    expect(durationTokenToDate("soon", "from")).toBe("Invalid date")
  })
})
