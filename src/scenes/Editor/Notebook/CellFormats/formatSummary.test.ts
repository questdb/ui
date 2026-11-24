import { describe, expect, it } from "vitest"
import {
  colourModeOf,
  columnsAndSamplesOf,
  formatsToSave,
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

  it("saves the formats the user left alone as they were", () => {
    // Given formats an agent wrote: Number only, empty, and a sign tone the
    // editor would drop next to thresholds
    const saved = {
      price: { kind: "number" as const },
      qty: {},
      pnl: {
        thresholds: [{ value: 0, tone: "positive" as const }],
        signTone: true,
      },
    }

    // When nothing changed, or only a column left empty was added
    // Then the saved formats are kept, the same object
    expect(formatsToSave(saved, { ...saved })).toBe(saved)
    expect(formatsToSave(saved, { ...saved, side: {} })).toBe(saved)
    expect(formatsToSave(undefined, { side: {} })).toBeUndefined()

    // When the user edits one column
    const next = formatsToSave(saved, {
      ...saved,
      price: { kind: "number", decimals: 2, prefix: "" },
    })

    // Then that column is tidied and the others stay as saved
    expect(next).toEqual({
      price: { kind: "number", decimals: 2 },
      qty: {},
      pnl: saved.pnl,
    })
    expect(next?.pnl).toBe(saved.pnl)
  })
})
