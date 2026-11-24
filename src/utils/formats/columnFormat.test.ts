import { describe, expect, it } from "vitest"
import {
  formatTargetOf,
  formatsNumbers,
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
    // A remainder that rounds up carries into the larger unit
    expect(formatValue(119_600, { kind: "duration" })).toBe("2 m 0 s")
    expect(formatValue(3_599_500, { kind: "duration" })).toBe("1 h 0 m")
    expect(formatValue(7_170_000, { kind: "duration" })).toBe("2 h 0 m")
    expect(formatValue(59_999.5, { kind: "duration" })).toBe("1 m 0 s")
    expect(formatValue(90_000, { kind: "duration" })).toBe("1 m 30 s")
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

describe("sanitizeColumnFormats", () => {
  it("preserves all valid formats in a wide saved result", () => {
    const formats = Object.fromEntries(
      Array.from({ length: 201 }, (_, i) => [
        `field_${i}`,
        { kind: "number", decimals: 2 },
      ]),
    )
    expect(sanitizeColumnFormats(formats)).toEqual(formats)
  })
})

describe("toneOf", () => {
  it("does not round an exact LONG up to a threshold", () => {
    const value = "9007199254740995"
    expect(formatValue(value, { kind: "number" })).toBe("9,007,199,254,740,995")
    expect(
      toneOf(value, {
        baseTone: "positive",
        thresholds: [{ value: 9_007_199_254_740_996, tone: "warning" }],
      }),
    ).toBe("positive")
  })
  it("keeps thresholds beyond the first twenty when importing a saved format", () => {
    const thresholds = Array.from({ length: 21 }, (_, value) => ({
      value,
      tone: value === 20 ? "negative" : "positive",
    }))
    const format = sanitizeColumnFormats({
      temperature: { thresholds },
    })?.temperature
    expect(format?.thresholds).toHaveLength(21)
    expect(toneOf(20, format)).toBe("negative")
  })
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
  it("starts with the tone at the lower visible bound", () => {
    expect(
      thresholdBands(
        {
          baseTone: "positive",
          thresholds: [
            { value: 10, tone: "warning" },
            { value: 90, tone: "negative" },
          ],
        },
        10,
        100,
      ),
    ).toEqual([
      { from: 10, to: 90, tone: "warning" },
      { from: 90, to: 100, tone: "negative" },
    ])
  })
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

describe("number text a format leaves alone", () => {
  it("keeps the column's text when a format only colours or draws", () => {
    // Given formats with only a visual, thresholds or sign tone
    // When / Then they do not reformat the numbers
    expect(formatsNumbers({ visual: "bar" })).toBe(false)
    expect(
      formatsNumbers({ thresholds: [{ value: 0, tone: "positive" }] }),
    ).toBe(false)
    expect(formatsNumbers({ signTone: true })).toBe(false)
    expect(formatsNumbers({ decimals: 2, visual: "bar" })).toBe(true)
    expect(formatsNumbers({ kind: "percent" })).toBe(true)
    expect(formatsNumbers({ prefix: "$" })).toBe(true)
  })

  it("never rounds a small non-zero value to zero, and keeps a DECIMAL's scale", () => {
    // Given / When / Then
    expect(formatValue(0.0000123, {})).toBe("0.0000123")
    expect(formatValue(-0.000456789, {})).toBe("-0.0004568")
    expect(formatValue(0.5, {})).toBe("0.5")
    expect(formatValue(1234.56789, {})).toBe("1,234.57")
    expect(formatValue("2.00", {})).toBe("2.00")
    expect(formatValue("1234.50", {})).toBe("1,234.50")
  })
})
