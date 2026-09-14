import { describe, expect, it } from "vitest"
import { isTimeVariableName, timeRangeToDeclareEntries } from "./timeRange"

const entryMap = (from: string, to: string) =>
  Object.fromEntries(
    timeRangeToDeclareEntries({ from, to }).map((e) => [e.name, e.value]),
  )

describe("timeRangeToDeclareEntries", () => {
  it("derives a relative range from a single now()", () => {
    // Given
    const range = { from: "now-1h", to: "now" }

    // When
    const entries = timeRangeToDeclareEntries(range)

    // Then
    expect(entries).toEqual([
      { name: "timeTo", value: "now()" },
      { name: "timeFrom", value: "dateadd('h', -1, @timeTo)" },
      { name: "timeFilter", value: "interval(@timeFrom, @timeTo)" },
    ])
  })

  it("renders absolute bounds as UTC literals", () => {
    // Given
    const from = "2026-01-10T09:30:00+03:00"
    const to = "2026-01-10T10:00:00+03:00"

    // When
    const entries = entryMap(from, to)

    // Then
    expect(entries.timeFrom).toBe("'2026-01-10T06:30:00.000Z'")
    expect(entries.timeTo).toBe("'2026-01-10T07:00:00.000Z'")
  })

  it("anchors a relative from on now() when to is not now", () => {
    // Given
    const range = { from: "now-1h", to: "now-5m" }

    // When
    const entries = entryMap(range.from, range.to)

    // Then
    expect(entries.timeTo).toBe("dateadd('m', -5, now())")
    expect(entries.timeFrom).toBe("dateadd('h', -1, now())")
  })
})

describe("isTimeVariableName", () => {
  it("matches the built-ins case-insensitively", () => {
    expect(isTimeVariableName("timeFilter")).toBe(true)
    expect(isTimeVariableName("TIMEFROM")).toBe(true)
    expect(isTimeVariableName("symbol")).toBe(false)
  })
})
