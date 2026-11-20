import { describe, expect, it } from "vitest"
import {
  WireError,
  parseChartType,
  parseFormats,
  parseInteractions,
  parseVisual,
  visualToWire,
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

  it.each([true, false, null])("round-trips digit animation %s", (enabled) => {
    // Given / When
    const visual = parseVisual(
      { type: "stat", animate_digits: enabled },
      "visual",
    )

    // Then
    expect(visualToWire(visual).animate_digits).toBe(enabled)
  })

  it("parses uptime buckets and state severities", () => {
    // Given / When
    const visual = parseVisual(
      {
        type: "uptime",
        buckets: 30,
        severity: [{ state: "charging", level: "warning" }],
      },
      "visual",
    )

    // Then
    expect(visual).toEqual({
      type: "uptime",
      buckets: 30,
      severity: { charging: "warning" },
    })
    expect(() =>
      parseVisual(
        { type: "uptime", severity: [{ state: "x", level: "fine" }] },
        "visual",
      ),
    ).toThrow(WireError)
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
