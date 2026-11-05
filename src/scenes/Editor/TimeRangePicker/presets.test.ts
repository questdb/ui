import { describe, expect, it } from "vitest"
import { TIME_PRESETS } from "./presets"
import { parseRelativeToken } from "./utils"

describe("TIME_PRESETS", () => {
  it("lists Grafana's quick ranges in Grafana's order", () => {
    // Given / When
    const labels = TIME_PRESETS.map((preset) => preset.label)
    // Then
    expect(labels.slice(0, 3)).toEqual([
      "Last 5 minutes",
      "Last 15 minutes",
      "Last 30 minutes",
    ])
    expect(labels.indexOf("Yesterday")).toBeGreaterThan(
      labels.indexOf("Last 5 years"),
    )
    expect(labels.indexOf("Today")).toBeGreaterThan(
      labels.indexOf("Previous year"),
    )
    expect(labels).toHaveLength(30)
  })

  it("uses only bounds the token grammar accepts", () => {
    // Given / When / Then
    for (const preset of TIME_PRESETS) {
      expect(parseRelativeToken(preset.dateFrom), preset.label).not.toBeNull()
      expect(parseRelativeToken(preset.dateTo), preset.label).not.toBeNull()
    }
  })

  it("maps calendar presets to aligned token pairs", () => {
    // Given
    const byLabel = Object.fromEntries(
      TIME_PRESETS.map((p) => [p.label, [p.dateFrom, p.dateTo]]),
    )
    // When / Then
    expect(byLabel["Yesterday"]).toEqual(["now-1d/d", "now-1d/d"])
    expect(byLabel["This day last week"]).toEqual(["now-7d/d", "now-7d/d"])
    expect(byLabel["Previous month"]).toEqual(["now-1M/M", "now-1M/M"])
    expect(byLabel["Today so far"]).toEqual(["now/d", "now"])
    expect(byLabel["This week"]).toEqual(["now/w", "now/w"])
  })
})
