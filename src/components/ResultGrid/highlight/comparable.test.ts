import { afterEach, describe, expect, it } from "vitest"
import { canonicalInstant, compareValues } from "./comparable"

const originalTz = process.env.TZ

describe("canonicalInstant", () => {
  afterEach(() => {
    process.env.TZ = originalTz
  })

  it("pads every ISO form to one nanosecond layout, whatever the local zone is", () => {
    // Given a browser in New York
    process.env.TZ = "America/New_York"

    // When the server's DATE, TIMESTAMP and TIMESTAMP_NS layouts and typed literals are read
    const date = canonicalInstant("2026-01-01T10:00:00.123Z")
    const micros = canonicalInstant("2026-01-01T10:00:00.123456Z")
    const nanos = canonicalInstant("2026-01-01T10:00:00.123456789Z")
    const spaced = canonicalInstant("2026-01-01 10:00:00")
    const hourOnly = canonicalInstant("2026-01-01T10")
    const dateOnly = canonicalInstant("2026-01-01")

    // Then each one is 10:00 UTC in the same layout, with the fraction kept
    expect(date).toBe("2026-01-01T10:00:00.123000000")
    expect(micros).toBe("2026-01-01T10:00:00.123456000")
    expect(nanos).toBe("2026-01-01T10:00:00.123456789")
    expect(spaced).toBe("2026-01-01T10:00:00.000000000")
    expect(hourOnly).toBe("2026-01-01T10:00:00.000000000")
    expect(dateOnly).toBe("2026-01-01T00:00:00.000000000")
  })

  it("shifts a zone offset to UTC and keeps the fraction", () => {
    // Given literals with an offset
    // When they are read
    const ahead = canonicalInstant("2026-01-01T10:00:00.5+03:00")
    const behind = canonicalInstant("2026-01-01T00:30:00-0130")

    // Then the offset moves the time, not the fraction
    expect(ahead).toBe("2026-01-01T07:00:00.500000000")
    expect(behind).toBe("2026-01-01T02:00:00.000000000")
  })

  it("rejects text that is not an ISO instant", () => {
    // Given the forms Date.parse would accept and QuestDB does not, plus an invalid date
    // When they are read
    const slashes = canonicalInstant("2026/09/28 10:00")
    const words = canonicalInstant("Sep 28 2026 10:00")
    const number = canonicalInstant("0")
    const yearOnly = canonicalInstant("2030")
    const badMonth = canonicalInstant("2026-13-01")
    const tenDigits = canonicalInstant("2026-01-01T10:00:00.1234567890Z")

    // Then none is an instant
    expect(slashes).toBeNull()
    expect(words).toBeNull()
    expect(number).toBeNull()
    expect(yearOnly).toBeNull()
    expect(badMonth).toBeNull()
    expect(tenDigits).toBeNull()
  })
})

describe("compareValues", () => {
  it("orders numbers by value and instants by text", () => {
    // Given numbers and two instants a nanosecond apart
    const earlier = canonicalInstant("2026-01-01T10:00:00.123456789Z") ?? ""
    const later = canonicalInstant("2026-01-01T10:00:00.123456790Z") ?? ""

    // When compared
    // Then the order holds at full precision
    expect(compareValues(9, 10)).toBeLessThan(0)
    expect(compareValues(10, 10)).toBe(0)
    expect(compareValues(earlier, later)).toBeLessThan(0)
    expect(compareValues(later, earlier)).toBeGreaterThan(0)
    expect(compareValues(later, later)).toBe(0)
  })
})
