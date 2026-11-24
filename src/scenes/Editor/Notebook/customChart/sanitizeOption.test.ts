import { describe, expect, it } from "vitest"
import { lightColors } from "../../../../theme"
import { resolveToken, sanitizeOption } from "./sanitizeOption"

const context = {
  colors: lightColors,
  renderItems: new Set(["barRange", "violin"]),
  maps: new Set(["world"]),
}

describe("sanitizeOption", () => {
  it("reserves the chart toolbar", () => {
    // Given a user toolbar preference
    const { option, problems } = sanitizeOption(
      { toolbox: { show: true }, series: [{ type: "bar" }] },
      context,
    )

    // Then only the console's toolbar can reach the renderer
    expect(option).not.toHaveProperty("toolbox")
    expect(problems.map(({ path }) => path)).toEqual(["toolbox"])
  })

  it("rejects timeline and media options", () => {
    // Given an option with a base option, timeline frames and media rules
    const scope = { series: [{ type: "bar" }] }
    const { option, problems } = sanitizeOption(
      {
        baseOption: scope,
        timeline: { data: ["2024"] },
        options: [scope],
        media: [{ option: scope }],
      },
      context,
    )

    // Then none of them reach the chart, and the option is refused
    expect(option).toEqual({})
    expect(problems).toEqual([
      expect.objectContaining({
        path: "",
        severity: "error",
        message: expect.stringContaining(
          "Timeline and media options",
        ) as string,
      }),
    ])
  })

  it("keeps the colour column of a tree bound from rows", () => {
    // Given a treemap whose nodes take a colour value from a column
    const raw = {
      series: [
        {
          type: "treemap",
          data: {
            $rows: {
              shape: "tree",
              path: ["sector"],
              value: "cap",
              color: "chg",
            },
          },
        },
      ],
    }

    // When
    const { option, problems } = sanitizeOption(raw, context)

    // Then the column name is kept for the binding, not taken for a colour
    expect((option.series as { data: unknown }[])[0].data).toEqual({
      $rows: { shape: "tree", path: ["sector"], value: "cap", color: "chg" },
    })
    expect(problems).toEqual([])
  })

  it("resolves tones and removes literal colours in map region fills", () => {
    // Given geo and map region fills
    const raw = {
      geo: { map: "world", itemStyle: { areaColor: "$series1:0.3" } },
      series: [
        {
          type: "map",
          map: "world",
          itemStyle: { areaColor: "#eeeeee" },
          emphasis: { itemStyle: { areaColor: "$series2" } },
        },
      ],
    }

    // When
    const { option, problems } = sanitizeOption(raw, context)

    // Then tones become theme colours and the literal colour is removed
    const geo = option.geo as { itemStyle: { areaColor: string } }
    expect(geo.itemStyle.areaColor).toMatch(/^rgba?\(|^#/)
    expect(geo.itemStyle.areaColor).not.toContain("$")
    const [map] = option.series as {
      itemStyle: { areaColor?: string }
      emphasis: { itemStyle: { areaColor: string } }
    }[]
    expect(map.itemStyle.areaColor).toBeUndefined()
    expect(map.emphasis.itemStyle.areaColor).not.toContain("$")
    expect(problems.map(({ path }) => path)).toContain(
      "series[0].itemStyle.areaColor",
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

  it("keeps built-in custom series and rejects unknown ones", () => {
    // Given
    const raw = {
      series: [
        { type: "custom", renderItem: "violin" },
        { type: "custom", renderItem: "unknown" },
        { type: "sparkle" },
      ],
    }

    // When
    const { option, problems } = sanitizeOption(raw, context)

    // Then
    expect(option.series).toEqual([{ type: "custom", renderItem: "violin" }])
    expect(problems.filter((p) => p.severity === "error")).toHaveLength(2)
  })
})
