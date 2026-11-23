import { describe, expect, it } from "vitest"
import { lightColors } from "../../../../theme"
import { resolveToken, sanitizeOption } from "./sanitizeOption"

const context = {
  colors: lightColors,
  renderItems: new Set(["barRange", "violin"]),
  maps: new Set(["world"]),
}

describe("sanitizeOption", () => {
  it("reserves chart toolbars in all option scopes", () => {
    // Given a user toolbar preference in every chart scope
    const scope = { toolbox: { show: true } }
    const { option, problems } = sanitizeOption(
      {
        ...scope,
        baseOption: scope,
        options: [scope],
        media: [{ option: scope }],
      },
      context,
    )

    // Then only console-owned toolbar configuration can reach the renderer
    expect(option).toEqual({
      baseOption: {},
      options: [{}],
      media: [{ option: {} }],
    })
    expect(problems.map(({ path }) => path)).toEqual([
      "toolbox",
      "baseOption.toolbox",
      "options[0].toolbox",
      "media[0].option.toolbox",
    ])
  })

  it("checks custom renderer authorization in nested option scopes", () => {
    const series = [{ type: "custom", renderItem: "unregistered" }]
    const { option, problems } = sanitizeOption(
      {
        baseOption: { series },
        options: [{ series }],
        media: [{ option: { series } }],
      },
      context,
    )
    expect(option).toEqual({
      baseOption: { series: [] },
      options: [{ series: [] }],
      media: [{ option: { series: [] } }],
    })
    expect(problems.map(({ path }) => path)).toEqual([
      "baseOption.series[0].renderItem",
      "options[0].series[0].renderItem",
      "media[0].option.series[0].renderItem",
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

  it("drops a link set on the option itself, which titles fall back to", () => {
    // Given links at the option's own level, outside any title
    const raw = {
      link: "https://example.invalid/phish",
      target: "self",
      title: { text: "Click me" },
      baseOption: { sublink: "https://example.invalid/sub" },
      series: [{ type: "bar" }],
    }

    // When
    const { option, problems } = sanitizeOption(raw, context)

    // Then no title can open them
    expect(option).not.toHaveProperty("link")
    expect(option).not.toHaveProperty("target")
    expect(option.baseOption).not.toHaveProperty("sublink")
    expect(problems.map(({ path }) => path)).toEqual(
      expect.arrayContaining(["link", "target", "baseOption.sublink"]),
    )
  })

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

  it("escapes a tooltip given as a string, which ECharts takes as a template", () => {
    // Given a series-level string tooltip
    const raw = {
      series: [{ type: "line", tooltip: "<img src=x onerror=alert(1)>" }],
    }

    // When
    const { option, problems } = sanitizeOption(raw, context)

    // Then
    expect((option.series as { tooltip: string }[])[0].tooltip).toBe(
      "&lt;img src=x onerror=alert(1)&gt;",
    )
    expect(problems.map((p) => p.path)).toContain("series[0].tooltip")
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
