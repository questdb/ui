import { describe, expect, it } from "vitest"
import { lightColors } from "../../../../theme"
import { resolveToken, sanitizeOption } from "./sanitizeOption"

const context = {
  colors: lightColors,
  renderItems: new Map([
    ["barRange", "barRange"],
    ["lanes", "nb1_lanes_x"],
  ]),
  maps: new Set(["world"]),
}

describe("sanitizeOption", () => {
  it("escapes HTML in tooltip templates and drops title links", () => {
    // Given
    const raw = {
      title: { text: "Fill", link: "javascript:alert(1)", target: "self" },
      tooltip: {
        formatter: "<img src=x onerror=alert(1)> {b}",
        extraCssText: "position:fixed",
      },
      series: [{ type: "bar" }],
    }

    // When
    const { option, problems } = sanitizeOption(raw, context)

    // Then
    expect(option.title).toEqual({ text: "Fill" })
    expect(option.tooltip).toEqual({
      formatter: "&lt;img src=x onerror=alert(1)&gt; {b}",
    })
    expect(problems.map((p) => p.path)).toEqual(
      expect.arrayContaining(["title.link", "tooltip.formatter"]),
    )
  })

  it("resolves tone tokens and removes literal colours and fonts", () => {
    // Given
    const raw = {
      textStyle: { fontFamily: "Comic Sans" },
      series: [
        { type: "line", itemStyle: { color: "$positive" } },
        { type: "line", itemStyle: { color: "#ff0000" } },
      ],
    }

    // When
    const { option } = sanitizeOption(raw, context)
    const series = option.series as { itemStyle: { color?: string } }[]

    // Then
    expect(option.textStyle).toEqual({})
    expect(series[0].itemStyle.color).toBe(lightColors.chartUp)
    expect(series[1].itemStyle.color).toBeUndefined()
  })

  it("resolves tokens in gauge colour bands", () => {
    // Given
    const raw = {
      series: [
        {
          type: "gauge",
          axisLine: {
            lineStyle: {
              color: [
                [0.6, "$positive"],
                [1, "#ff0000"],
              ],
            },
          },
        },
      ],
    }

    // When
    const { option } = sanitizeOption(raw, context)
    const series = option.series as {
      axisLine: { lineStyle: { color: unknown } }
    }[]

    // Then
    expect(series[0].axisLine.lineStyle.color).toEqual([
      [0.6, lightColors.chartUp],
    ])
  })

  it("adds opacity to a token", () => {
    // Given / When / Then
    expect(resolveToken("$series1:0.5", lightColors)).toMatch(
      /^rgba\(.*0\.5\)$/,
    )
    expect(resolveToken("$nope", lightColors)).toBeNull()
  })

  it("maps custom series to registered names and rejects unknown ones", () => {
    // Given
    const raw = {
      series: [
        { type: "custom", renderItem: "lanes" },
        { type: "custom", renderItem: "unknown" },
        { type: "sparkle" },
      ],
    }

    // When
    const { option, problems } = sanitizeOption(raw, context)

    // Then
    expect(option.series).toEqual([
      { type: "custom", renderItem: "nb1_lanes_x" },
    ])
    expect(problems.filter((p) => p.severity === "error")).toHaveLength(2)
  })

  it("allows only data: images", () => {
    // Given
    const raw = {
      series: [
        { type: "scatter", symbol: "image://https://evil.example/beacon.png" },
        { type: "scatter", symbol: "image://data:image/png;base64,AAAA" },
      ],
    }

    // When
    const { option } = sanitizeOption(raw, context)

    // Then
    expect(option.series).toEqual([
      { type: "scatter", symbol: "circle" },
      { type: "scatter", symbol: "image://data:image/png;base64,AAAA" },
    ])
  })
})
