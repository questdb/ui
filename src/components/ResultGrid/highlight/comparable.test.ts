import { afterEach, describe, expect, it } from "vitest"
import {
  asNumeric,
  canonicalInstant,
  compareValues,
  differenceOf,
} from "./comparable"

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

  it("orders integers past 2^53 by their exact value, also against a number", () => {
    // Given two LONGs one unit apart, and one on each side of the safe range
    const lower = BigInt("1727000000000000010")
    const higher = BigInt("1727000000000000011")

    // When compared
    // Then a double would call them equal, a bigint does not
    expect(compareValues(higher, lower)).toBeGreaterThan(0)
    expect(compareValues(higher, higher)).toBe(0)
    expect(compareValues(BigInt("9007199254740993"), 9007199254740992)).toBe(1)
  })

  it("orders decimals past double precision exactly, also against a literal", () => {
    // Given DECIMAL(38,18) values one unit apart, a negative one, and the literal 1.5
    const lower = asNumeric("1234.123456789012345678") ?? 0
    const higher = asNumeric("1234.123456789012345679") ?? 0
    const negative = asNumeric("-1234.123456789012345678") ?? 0
    const aboveLiteral = asNumeric("1.500000000000000001") ?? 0
    const equalToLiteral = asNumeric("1.500000000000000000") ?? 0

    // When compared
    // Then a double would call them equal, a scaled bigint does not
    expect(compareValues(higher, lower)).toBeGreaterThan(0)
    expect(compareValues(higher, higher)).toBe(0)
    expect(compareValues(negative, lower)).toBeLessThan(0)
    expect(compareValues(aboveLiteral, 1.5)).toBe(1)
    expect(compareValues(equalToLiteral, 1.5)).toBe(0)
  })
})

describe("asNumeric", () => {
  it("keeps an integer past 2^53 exact and reads everything else as a number", () => {
    // Given a LONG past 2^53 as the server sends it, a small LONG and a double
    // When read
    const long = asNumeric("1727000000000000011")
    const small = asNumeric("50825")
    const double = asNumeric("1.5")
    const blank = asNumeric(" ")

    // Then only the large integer becomes a bigint
    expect(long).toBe(BigInt("1727000000000000011"))
    expect(small).toBe(50825)
    expect(double).toBe(1.5)
    expect(blank).toBeNull()
  })

  it("keeps a decimal past double precision exact as a scaled bigint", () => {
    // Given a DECIMAL(38,18) value as the server sends it, and a short one
    // When read
    const long = asNumeric("1234.123456789012345678")
    const short = asNumeric("1234.125")

    // Then only the long one becomes a scaled bigint
    expect(long).toEqual({
      unscaled: BigInt("1234123456789012345678"),
      scale: 18,
    })
    expect(short).toBe(1234.125)
  })
})

describe("differenceOf", () => {
  it("measures one unit past 2^53 and a fraction below it", () => {
    // Given two LONGs one unit apart and two doubles
    // When subtracted
    const unit = differenceOf(
      BigInt("1727000000000000011"),
      BigInt("1727000000000000010"),
    )
    const fraction = differenceOf(1.5, 1)

    // Then both differences are exact
    expect(unit).toBe(1)
    expect(fraction).toBe(0.5)
  })

  it("measures one unit at the eighteenth decimal", () => {
    // Given two DECIMAL(38,18) values one unit apart
    // When subtracted
    const unit = differenceOf(
      asNumeric("1234.123456789012345679") ?? 0,
      asNumeric("1234.123456789012345678") ?? 0,
    )

    // Then the difference is that unit, not zero
    expect(unit).toBe(1e-18)
  })
})
