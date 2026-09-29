import { describe, expect, it } from "vitest"
import { alignInZone } from "./timeZone"

const at = (iso: string) => new Date(iso)
const iso = (d: Date) => d.toISOString()

describe("alignInZone", () => {
  // Thursday 2026-09-17, 11:24 in Istanbul (UTC+3)
  const thursday = at("2026-09-17T08:24:36.000Z")

  it("starts and ends the day on the zone's midnight, not UTC's", () => {
    expect(iso(alignInZone(thursday, "d", "from", "Europe/Istanbul"))).toBe(
      "2026-09-16T21:00:00.000Z",
    )
    expect(iso(alignInZone(thursday, "d", "to", "Europe/Istanbul"))).toBe(
      "2026-09-17T20:59:59.999Z",
    )
  })

  it("starts the week on Monday in the zone", () => {
    expect(iso(alignInZone(thursday, "w", "from", "Europe/Istanbul"))).toBe(
      "2026-09-13T21:00:00.000Z",
    )
  })

  it("starts the month and the year in the zone", () => {
    expect(iso(alignInZone(thursday, "M", "from", "Europe/Istanbul"))).toBe(
      "2026-08-31T21:00:00.000Z",
    )
    expect(iso(alignInZone(thursday, "y", "from", "Europe/Istanbul"))).toBe(
      "2025-12-31T21:00:00.000Z",
    )
  })

  it("is plain UTC truncation for the UTC zone", () => {
    expect(iso(alignInZone(thursday, "d", "from", "UTC"))).toBe(
      "2026-09-17T00:00:00.000Z",
    )
    expect(iso(alignInZone(thursday, "h", "to", "UTC"))).toBe(
      "2026-09-17T08:59:59.999Z",
    )
  })

  it("gives a 25-hour day when daylight saving ends inside it", () => {
    // Berlin leaves summer time on Sunday 2026-10-25 at 03:00 CEST
    const thatSunday = at("2026-10-25T12:00:00.000Z")
    const start = alignInZone(thatSunday, "d", "from", "Europe/Berlin")
    const end = alignInZone(thatSunday, "d", "to", "Europe/Berlin")
    expect(iso(start)).toBe("2026-10-24T22:00:00.000Z")
    expect(iso(end)).toBe("2026-10-25T22:59:59.999Z")
    expect(end.getTime() - start.getTime() + 1).toBe(25 * 3_600_000)
  })
})
