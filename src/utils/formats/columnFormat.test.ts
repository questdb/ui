import { describe, expect, it } from "vitest"
import {
  formatTargetOf,
  formatValue,
  sanitizeColumnFormats,
  thresholdBands,
  toneOf,
} from "./columnFormat"

describe("formatValue", () => {
  it("formats numbers by kind", () => {
    // Given / When / Then
    expect(formatValue(1234567, { kind: "number" })).toBe("1,234,567")
    expect(formatValue(0.0523, { kind: "percent" })).toBe("5.23%")
    expect(formatValue(1.091955, { kind: "price", decimals: 5 })).toBe(
      "1.09196",
    )
    expect(formatValue(1536, { kind: "bytes" })).toBe("1.5 KB")
    expect(formatValue(1500, { kind: "duration" })).toBe("1.5 s")
    expect(formatValue(42.5, { kind: "duration" })).toBe("42.5 ms")
    expect(formatValue(16_700_000_000, { compact: true })).toBe("16.7B")
  })

  it("groups exact LONG and DECIMAL text without rounding it through a double", () => {
    expect(formatValue("9007199254740993", { kind: "number" })).toBe(
      "9,007,199,254,740,993",
    )
    expect(
      formatValue("-9007199254740993.125", { kind: "price", decimals: 3 }),
    ).toBe("-9,007,199,254,740,993.125")
  })

  it("adds the prefix and suffix around numbers only", () => {
    // Given
    const format = { prefix: "$", suffix: " USD", decimals: 2 }

    // When / Then
    expect(formatValue(12.5, format)).toBe("$12.50 USD")
    expect(formatValue("n/a", format)).toBe("n/a")
  })

  it("shows a dash for nulls and the raw text without a format", () => {
    // Given / When / Then
    expect(formatValue(null, { kind: "number" })).toBe("—")
    expect(formatValue("EURUSD", undefined)).toBe("EURUSD")
  })
})

describe("toneOf", () => {
  it("takes the highest threshold a value reaches", () => {
    // Given
    const format = {
      baseTone: "positive" as const,
      thresholds: [
        { value: 80, tone: "warning" as const },
        { value: 95, tone: "negative" as const },
      ],
    }

    // When / Then
    expect(toneOf(10, format)).toBe("positive")
    expect(toneOf(80, format)).toBe("warning")
    expect(toneOf(99, format)).toBe("negative")
  })

  it("colours by sign when asked", () => {
    // Given / When / Then
    expect(toneOf(0.2, { signTone: true })).toBe("positive")
    expect(toneOf(-0.2, { signTone: true })).toBe("negative")
    expect(toneOf(0, { signTone: true })).toBeUndefined()
  })
})

describe("thresholdBands", () => {
  it("splits the range at each threshold", () => {
    // Given
    const format = {
      baseTone: "positive" as const,
      thresholds: [{ value: 70, tone: "negative" as const }],
    }

    // When
    const bands = thresholdBands(format, 0, 100)

    // Then
    expect(bands).toEqual([
      { from: 0, to: 70, tone: "positive" },
      { from: 70, to: 100, tone: "negative" },
    ])
  })
})

describe("sanitizeColumnFormats", () => {
  it("keeps known fields and drops the rest", () => {
    // Given
    const raw = {
      price: { kind: "price", decimals: 5, evil: "<script>" },
      fill: { visual: "bar", thresholds: [{ value: 1, tone: "nope" }] },
      __proto__: { kind: "number" },
    }

    // When
    const formats = sanitizeColumnFormats(raw)

    // Then
    expect(formats).toEqual({
      price: { kind: "price", decimals: 5 },
      fill: { visual: "bar" },
    })
  })
})

describe("formatTargetOf", () => {
  it("formats numbers and arrays, and nothing else", () => {
    // Given / When / Then
    expect(formatTargetOf("DOUBLE")).toBe("number")
    expect(formatTargetOf("long")).toBe("number")
    expect(formatTargetOf("DECIMAL(18,2)")).toBe("number")
    expect(formatTargetOf("ARRAY")).toBe("array")
    expect(formatTargetOf("TIMESTAMP")).toBeNull()
    expect(formatTargetOf("CHAR")).toBeNull()
    expect(formatTargetOf("SYMBOL")).toBeNull()
  })
})
