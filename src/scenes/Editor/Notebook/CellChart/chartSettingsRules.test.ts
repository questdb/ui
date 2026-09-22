import { describe, expect, it } from "vitest"
import { axisBoundsError, candlestickMissingOhlc } from "./chartSettingsRules"

describe("axisBoundsError", () => {
  it("accepts an empty axis, one pinned edge, and min below max", () => {
    // Given
    const cases = [
      undefined,
      {},
      { min: 0 },
      { max: 100 },
      { min: 0, max: 100 },
    ]
    // When
    const errors = cases.map(axisBoundsError)
    // Then
    expect(errors).toEqual([null, null, null, null, null])
  })

  it("rejects min equal to or above max", () => {
    // Given
    const equal = { min: 5, max: 5 }
    const inverted = { min: 10, max: 0 }
    // When / Then
    expect(axisBoundsError(equal)).toBe("Min must be below max")
    expect(axisBoundsError(inverted)).toBe("Min must be below max")
  })
})

describe("candlestickMissingOhlc", () => {
  it("flags a candlestick whose ohlc reuses one column twice", () => {
    // Given
    const query = {
      type: "candlestick" as const,
      yColumns: [],
      ohlc: { open: "o", high: "h", low: "l", close: "o" },
    }
    // When / Then
    expect(candlestickMissingOhlc(query)).toBe(true)
  })

  it("ignores a disabled candlestick and a non-candlestick query", () => {
    // Given
    const disabled = {
      type: "candlestick" as const,
      yColumns: [],
      enabled: false,
    }
    const line = { type: "line" as const, yColumns: ["price"] }
    // When / Then
    expect(candlestickMissingOhlc(disabled)).toBe(false)
    expect(candlestickMissingOhlc(line)).toBe(false)
  })
})
