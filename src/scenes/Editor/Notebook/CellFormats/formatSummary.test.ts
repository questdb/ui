import { describe, expect, it } from "vitest"
import {
  colourModeOf,
  columnsAndSamplesOf,
  summarise,
  tidyFormats,
  withColourMode,
} from "./formatSummary"

describe("format summary", () => {
  it("summarises a format in a line", () => {
    // Given / When / Then
    expect(
      summarise({ kind: "price", decimals: 2, prefix: "$", signTone: true }),
    ).toBe('Price · 2 decimals · "$" · coloured by sign')
    expect(summarise({})).toBe("Number")
  })

  it("switches colouring between none, sign and thresholds", () => {
    // Given
    const format = { decimals: 1, signTone: true }

    // When
    const thresholds = withColourMode(format, "thresholds")
    const none = withColourMode(thresholds, "none")

    // Then
    expect(colourModeOf(format)).toBe("sign")
    expect(thresholds).toEqual({
      decimals: 1,
      thresholds: [{ value: 0, tone: "positive" }],
    })
    expect(none).toEqual({ decimals: 1 })
  })

  it("saves only what was set, thresholds ascending, and no empty formats", () => {
    // Given
    const formats = {
      empty: { prefix: "" },
      volume: { kind: "number" as const },
      lag: {
        thresholds: [
          { value: 10, tone: "negative" as const },
          { value: 5, tone: "warning" as const },
        ],
        baseTone: "positive" as const,
        signTone: true,
      },
    }

    // When / Then
    expect(tidyFormats(formats)).toEqual({
      volume: { kind: "number" },
      lag: {
        thresholds: [
          { value: 5, tone: "warning" },
          { value: 10, tone: "negative" },
        ],
        baseTone: "positive",
      },
    })
    expect(tidyFormats({ empty: {} })).toBeUndefined()
  })

  it("collects every column once with a non-null value to preview", () => {
    // Given two statements sharing a column
    const results = [
      {
        columns: [
          { name: "ts", type: "TIMESTAMP" },
          { name: "price", type: "DOUBLE" },
        ],
        rows: [
          ["2026-01-01T00:00:00.000000Z", null],
          ["2026-01-01T00:01:00.000000Z", 12.5],
        ],
      },
      null,
      { columns: [{ name: "price", type: "DOUBLE" }], rows: [[99]] },
    ]

    // When
    const { columns, samples } = columnsAndSamplesOf(results)

    // Then
    expect(columns.map((c) => c.name)).toEqual(["ts", "price"])
    expect(samples.price).toBe(12.5)
  })
})
