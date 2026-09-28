import { afterEach, describe, expect, it } from "vitest"
import { parseInstant } from "./comparable"

const originalTz = process.env.TZ

describe("parseInstant", () => {
  afterEach(() => {
    process.env.TZ = originalTz
  })

  it("reads a literal without a zone as UTC, whatever the local zone is", () => {
    // Given a browser in New York
    process.env.TZ = "America/New_York"
    const tenUtc = Date.parse("2026-01-01T10:00:00Z")

    // When zone-less literals in the forms QuestDB accepts are parsed
    const dateTime = parseInstant("2026-01-01T10:00:00")
    const spaced = parseInstant("2026-01-01 10:00:00")
    const hourOnly = parseInstant("2026-01-01T10")
    const micros = parseInstant("2026-01-01T10:00:00.000000")

    // Then each one is 10:00 UTC, not 10:00 local
    expect(dateTime).toBe(tenUtc)
    expect(spaced).toBe(tenUtc)
    expect(hourOnly).toBe(tenUtc)
    expect(micros).toBe(tenUtc)
  })

  it("keeps an explicit zone and rejects text that is not an instant", () => {
    // Given literals with a zone, and one that is not a timestamp
    process.env.TZ = "America/New_York"

    // When they are parsed
    const zulu = parseInstant("2026-01-01T10:00:00Z")
    const offset = parseInstant("2026-01-01T10:00:00+03:00")
    const dateOnly = parseInstant("2026-01-01")
    const words = parseInstant("yesterday")

    // Then the zone decides the instant, and words give null
    expect(zulu).toBe(Date.parse("2026-01-01T10:00:00Z"))
    expect(offset).toBe(Date.parse("2026-01-01T07:00:00Z"))
    expect(dateOnly).toBe(Date.parse("2026-01-01T00:00:00Z"))
    expect(words).toBeNull()
  })
})
