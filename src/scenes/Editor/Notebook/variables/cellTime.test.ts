import { describe, expect, it } from "vitest"
import type { DeclareEntry } from "../../../../store/notebook"
import {
  cellTimeEntries,
  parseTimeShift,
  readCellTime,
  describeCellTime,
  withCellTime,
} from "./cellTime"
import { TIME_PRESETS } from "../../TimeRangePicker/presets"

const values = (entries: DeclareEntry[]) =>
  Object.fromEntries(entries.map((entry) => [entry.name, entry.value]))

describe("parseTimeShift", () => {
  it.each([
    ["-1s", -1, "s"],
    ["-30m", -30, "m"],
    ["+6h", 6, "h"],
    ["-1d", -1, "d"],
    ["+2w", 2, "w"],
    ["-1M", -1, "M"],
    ["+9999y", 9999, "y"],
  ])("accepts %s", (token, amount, unit) => {
    expect(parseTimeShift(token)).toEqual({ amount, unit })
  })

  it.each([
    ["1d", "no sign"],
    ["--1d", "double sign"],
    ["-0d", "zero"],
    ["-01d", "leading zero"],
    ["-10000d", "over the cap"],
    ["-1ms", "two-letter unit"],
    ["-1H", "undocumented uppercase hour"],
    ["-1D", "uppercase day"],
    ["", "empty"],
    [" -1d", "leading space"],
  ])("rejects %s (%s)", (token) => {
    expect(parseTimeShift(token)).toBeNull()
  })
})

describe("cellTimeEntries", () => {
  it("returns today's entries for an override without a shift", () => {
    // Given
    const cell = { timeRange: { from: "now-15m", to: "now" } }

    // When
    const entries = values(cellTimeEntries({ from: "now-1h", to: "now" }, cell))

    // Then
    expect(entries).toEqual({
      timeTo: "now()",
      timeFrom: "dateadd('m', -15, @timeTo)",
      timeFilter: "interval(@timeFrom, @timeTo)",
    })
  })

  it("shifts a relative range once, through the now() anchor", () => {
    // Given a relative from that hangs off @timeTo
    const cell = { timeShift: "-1d" }

    // When
    const entries = values(cellTimeEntries({ from: "now-6h", to: "now" }, cell))

    // Then @timeFrom is not wrapped again
    expect(entries.timeTo).toBe("dateadd('d', -1, now())")
    expect(entries.timeFrom).toBe("dateadd('h', -6, @timeTo)")
    expect(entries.timeFilter).toBe("interval(@timeFrom, @timeTo)")
  })

  it("shifts both bounds when to is not now", () => {
    // Given
    const cell = { timeShift: "+2h" }

    // When
    const entries = values(
      cellTimeEntries({ from: "now-1h", to: "now-5m" }, cell),
    )

    // Then each bound anchors on the shifted now()
    expect(entries.timeTo).toBe("dateadd('m', -5, dateadd('h', 2, now()))")
    expect(entries.timeFrom).toBe("dateadd('h', -1, dateadd('h', 2, now()))")
  })

  it("wraps absolute bounds in the shift", () => {
    // Given
    const cell = {
      timeRange: { from: "2026-01-10T06:30:00Z", to: "2026-01-10T07:00:00Z" },
      timeShift: "-1w",
    }

    // When
    const entries = values(cellTimeEntries(undefined, cell))

    // Then
    expect(entries.timeFrom).toBe(
      "dateadd('w', -1, '2026-01-10T06:30:00.000Z')",
    )
    expect(entries.timeTo).toBe("dateadd('w', -1, '2026-01-10T07:00:00.000Z')")
  })

  it("declares nothing for a shift without any range", () => {
    // Given
    const cell = { timeShift: "-1d" }

    // When
    const entries = cellTimeEntries(undefined, cell)

    // Then
    expect(entries).toEqual([])
  })
})

describe("withCellTime", () => {
  const notebookEntries: DeclareEntry[] = [
    { name: "timeTo", value: "now()" },
    { name: "timeFrom", value: "dateadd('h', -1, @timeTo)" },
    { name: "timeFilter", value: "interval(@timeFrom, @timeTo)" },
    { name: "venue", value: "'LSE'" },
    { name: "pair", value: "('EURUSD', 'GBPUSD')" },
  ]

  it("replaces the three time entries and keeps the rest in order", () => {
    // Given
    const cell = { timeRange: { from: "now-15m", to: "now" } }

    // When
    const entries = withCellTime(
      notebookEntries,
      { from: "now-1h", to: "now" },
      cell,
    )

    // Then
    expect(entries.map((entry) => entry.name)).toEqual([
      "timeTo",
      "timeFrom",
      "timeFilter",
      "venue",
      "pair",
    ])
    expect(values(entries).timeFrom).toBe("dateadd('m', -15, @timeTo)")
  })

  it("returns the same array when the cell sets nothing", () => {
    // Given
    const cell = {}

    // When
    const entries = withCellTime(
      notebookEntries,
      { from: "now-1h", to: "now" },
      cell,
    )

    // Then
    expect(entries).toBe(notebookEntries)
  })

  it("adds time entries for an override when the notebook has none", () => {
    // Given
    const cell = { timeRange: { from: "now-5m", to: "now" } }

    // When
    const entries = withCellTime(
      [{ name: "venue", value: "'LSE'" }],
      undefined,
      cell,
    )

    // Then
    expect(entries.map((entry) => entry.name)).toEqual([
      "timeTo",
      "timeFrom",
      "timeFilter",
      "venue",
    ])
  })
})

describe("describeCellTime", () => {
  it("names a preset range and appends the signed shift after a comma", () => {
    // Given
    const cell = { timeRange: { from: "now-30m", to: "now" }, timeShift: "-1d" }

    // When / Then
    expect(describeCellTime(cell, TIME_PRESETS)).toBe("Last 30 minutes, -1d")
    expect(describeCellTime({ timeShift: "+1d" }, TIME_PRESETS)).toBe("+1d")
    expect(describeCellTime({}, TIME_PRESETS)).toBeNull()
  })

  it("writes the full time for an absolute range", () => {
    // Given
    const cell = {
      timeRange: { from: "2025-01-01T00:00:00Z", to: "2025-01-02T00:00:00Z" },
    }

    // When / Then
    expect(describeCellTime(cell, TIME_PRESETS)).toBe(
      "2025-01-01 00:00:00 - 2025-01-02 00:00:00",
    )
  })
})

describe("readCellTime", () => {
  it("keeps valid fields and drops invalid ones", () => {
    // Given
    const raw = {
      timeRange: { from: "now-1h", to: "now" },
      timeShift: "1d",
      showTimeRange: true,
    }

    // When
    const time = readCellTime(raw, undefined)

    // Then the bad shift is gone and the flag stays because a range exists
    expect(time).toEqual({
      timeRange: { from: "now-1h", to: "now" },
      showTimeRange: true,
    })
  })

  it("drops the header flag when nothing is set", () => {
    // Given
    const raw = {
      timeRange: { from: "garbage", to: "now" },
      showTimeRange: true,
    }

    // When
    const time = readCellTime(raw, undefined)

    // Then
    expect(time).toEqual({})
  })

  it("drops everything on a markdown cell", () => {
    // Given
    const raw = {
      timeRange: { from: "now-1h", to: "now" },
      timeShift: "-1d",
      showTimeRange: true,
    }

    // When
    const time = readCellTime(raw, "markdown")

    // Then
    expect(time).toEqual({})
  })
})
