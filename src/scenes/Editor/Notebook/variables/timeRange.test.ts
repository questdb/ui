import { describe, expect, it, vi } from "vitest"

vi.mock("../../../../utils/timeZone", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../utils/timeZone")>()),
  browserTimeZone: () => "Europe/Istanbul",
}))
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

describe("timeRangeToDeclareEntries with calendar alignment", () => {
  const tz = "'Europe/Istanbul'"

  it("truncates a from bound in the browser's zone and keeps to at now", () => {
    // Given
    const entries = entryMap("now/d", "now")
    // Then
    expect(entries.timeTo).toBe("now()")
    expect(entries.timeFrom).toBe(
      `to_utc(date_trunc('day', to_timezone(@timeTo, ${tz})), ${tz})`,
    )
  })

  it("ends an aligned to bound on the last microsecond of the zone's day", () => {
    // Given
    const entries = entryMap("now-1d/d", "now-1d/d")
    const yesterday = `to_timezone(dateadd('d', -1, now()), ${tz})`
    // Then
    expect(entries.timeFrom).toBe(
      `to_utc(date_trunc('day', ${yesterday}), ${tz})`,
    )
    expect(entries.timeTo).toBe(
      `dateadd('u', -1, to_utc(dateadd('d', 1, date_trunc('day', ${yesterday})), ${tz}))`,
    )
  })

  it("names every unit QuestDB expects", () => {
    // Given / When
    const week = entryMap("now/w", "now/w")
    const month = entryMap("now-1M/M", "now-1M/M")
    const year = entryMap("now/y", "now")
    // Then
    expect(week.timeFrom).toBe(
      `to_utc(date_trunc('week', to_timezone(now(), ${tz})), ${tz})`,
    )
    expect(month.timeFrom).toBe(
      `to_utc(date_trunc('month', to_timezone(dateadd('M', -1, now()), ${tz})), ${tz})`,
    )
    expect(year.timeFrom).toBe(
      `to_utc(date_trunc('year', to_timezone(@timeTo, ${tz})), ${tz})`,
    )
  })

  it("truncates the shifted instant when a shift is set", () => {
    // Given
    const entries = Object.fromEntries(
      timeRangeToDeclareEntries(
        { from: "now/d", to: "now" },
        { amount: -1, unit: "d" },
      ).map((e) => [e.name, e.value]),
    )
    // Then
    expect(entries.timeTo).toBe("dateadd('d', -1, now())")
    expect(entries.timeFrom).toBe(
      `to_utc(date_trunc('day', to_timezone(@timeTo, ${tz})), ${tz})`,
    )
  })
})

describe("timeRangeToDeclareEntries with a shift", () => {
  it("moves the now() anchor so a relative from is shifted once", () => {
    // Given
    const range = { from: "now-1h", to: "now" }

    // When
    const entries = timeRangeToDeclareEntries(range, { amount: -1, unit: "d" })

    // Then
    expect(entries).toEqual([
      { name: "timeTo", value: "dateadd('d', -1, now())" },
      { name: "timeFrom", value: "dateadd('h', -1, @timeTo)" },
      { name: "timeFilter", value: "interval(@timeFrom, @timeTo)" },
    ])
  })

  it("shifts absolute literals forward with a positive amount", () => {
    // Given
    const range = { from: "2026-01-10T06:30:00Z", to: "2026-01-10T07:00:00Z" }

    // When
    const entries = Object.fromEntries(
      timeRangeToDeclareEntries(range, { amount: 3, unit: "h" }).map((e) => [
        e.name,
        e.value,
      ]),
    )

    // Then
    expect(entries.timeFrom).toBe("dateadd('h', 3, '2026-01-10T06:30:00.000Z')")
    expect(entries.timeTo).toBe("dateadd('h', 3, '2026-01-10T07:00:00.000Z')")
  })
})

describe("isTimeVariableName", () => {
  it("matches the built-ins case-insensitively", () => {
    expect(isTimeVariableName("timeFilter")).toBe(true)
    expect(isTimeVariableName("TIMEFROM")).toBe(true)
    expect(isTimeVariableName("symbol")).toBe(false)
  })
})
