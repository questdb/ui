import { describe, expect, it } from "vitest"
import {
  WireError,
  parseChartType,
  parseFormats,
  parseInteractions,
  parseVisual,
} from "./dashboardWire"

describe("dashboard wire", () => {
  it("parses a visual and drops null roles", () => {
    // Given / When
    const visual = parseVisual(
      {
        type: "orderBook",
        columns: { price: "px", size: null, path: null },
        min: null,
        max: null,
        sparkline_query: null,
      },
      "visual",
    )

    // Then
    expect(visual).toEqual({ type: "orderBook", columns: { price: "px" } })
  })

  it("rejects an unknown visual type", () => {
    // Given / When / Then
    expect(() => parseVisual({ type: "pie3d" }, "visual")).toThrow(WireError)
  })

  it("parses formats by column and validates tones", () => {
    // Given
    const wire = [
      {
        column: "cpu",
        kind: "percent",
        decimals: 0,
        thresholds: [{ value: 0.9, tone: "negative" }],
        base_tone: "positive",
      },
    ]

    // When / Then
    expect(parseFormats(wire, "formats")).toEqual({
      cpu: {
        kind: "percent",
        decimals: 0,
        thresholds: [{ value: 0.9, tone: "negative" }],
        baseTone: "positive",
      },
    })
    expect(() =>
      parseFormats([{ column: "x", base_tone: "pink" }], "formats"),
    ).toThrow(WireError)
  })

  it("strips @ from interaction variables", () => {
    // Given / When / Then
    expect(
      parseInteractions(
        { click: { variable: "@sym", column: null }, brush: null },
        "interactions",
      ),
    ).toEqual({ click: { variable: "sym" } })
  })

  it("requires chart type names that are identifiers", () => {
    // Given / When / Then
    expect(() =>
      parseChartType({ name: "1 bad", render_item: "return null" }, "t"),
    ).toThrow(WireError)
  })
})
