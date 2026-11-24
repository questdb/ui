import { describe, expect, it } from "vitest"
import { darkColors, lightColors } from "../../../../theme"
import {
  chordOption,
  footprintOption,
  gaugeOption,
  graphOption,
  liquidityHeatmapOption,
  mapOption,
  sankeyOption,
  stateTimelineOption,
  sunburstOption,
  treemapOption,
  volumeProfileOption,
} from "./visualOptions"
import { sparklineGeometry, statTiles } from "./StatTiles"
import { bulletRows } from "./Bullets"
import { interactionEvents } from "../interactions/chartInteractions"
import type { StatementRows } from "./statementRows"

const rows = (
  columns: [string, string][],
  data: StatementRows["rows"],
): StatementRows => ({
  columns: columns.map(([name, type]) => ({ name, type })),
  rows: data,
})

const series = (option: unknown) =>
  (option as { series: Record<string, unknown>[] }).series

// What a click on a data item writes, bound to `column`: that column (else
// the item's drawn column) of the rows the item was drawn from.
const clickWrites = (
  statements: StatementRows[],
  column: string | undefined,
  data: unknown,
  params: Record<string, unknown> = {},
): string | undefined => {
  const written: Record<string, string>[] = []
  interactionEvents(
    { click: { variable: "v", column } },
    (values) => written.push(values),
    () => statements,
  ).click({ componentType: "series", ...params, data }, {} as never)
  return written[0]?.v
}

it("reads the bound gauge click value from its first row, not its reading or label", () => {
  // Given a gauge with a clamped reading and a separate selection column
  const statements = [
    rows(
      [
        ["load", "DOUBLE"],
        ["station", "SYMBOL"],
      ],
      [
        [65, "east"],
        [2, "west"],
      ],
    ),
  ]
  const { option } = gaugeOption({
    visual: { type: "gauge", max: 50 },
    colors: lightColors,
    formats: {},
    statements,
  })

  // When the non-silent progress series is clicked
  const [{ silent }, { data }] = series(option)
  const datum = (data as { value: number }[])[0]

  // Then the interaction uses the raw bound column
  expect(silent).toBe(true)
  expect(datum.value).toBe(50)
  expect(clickWrites(statements, "station", datum)).toBe("'east'")
  // And with no label column an unbound click names nothing to write
  expect(clickWrites(statements, undefined, datum)).toBeUndefined()
})

it("retains a graph edge's query column for selection", () => {
  const statements = [
    rows(
      [
        ["from", "SYMBOL"],
        ["to", "SYMBOL"],
        ["weight", "INT"],
        ["route", "SYMBOL"],
      ],
      [["east", "west", 1, "r1"]],
    ),
  ]
  const { option } = graphOption({
    visual: { type: "graph" },
    colors: lightColors,
    formats: {},
    statements,
  })
  const [graph] = series(option)
  const edge = (graph.links as unknown[])[0]
  expect(clickWrites(statements, "route", edge, { dataType: "edge" })).toBe(
    "'r1'",
  )
})

it("keeps all links in a large graph without scheduling force layout", () => {
  const links = Array.from({ length: 251 }, (_, i) => [
    `from-${i}`,
    `to-${i}`,
    1,
  ])
  const { option, drawn } = graphOption({
    visual: { type: "graph" },
    colors: lightColors,
    formats: {},
    statements: [
      rows(
        [
          ["from", "SYMBOL"],
          ["to", "SYMBOL"],
          ["weight", "INT"],
        ],
        links,
      ),
    ],
  })
  expect(drawn).toEqual({ nodes: 502, links: 251 })
  expect(series(option)[0]).toMatchObject({
    layout: "circular",
    draggable: false,
  })
  expect(series(option)[0].links).toHaveLength(251)
})

describe("stateTimelineOption", () => {
  it("carries each segment's bound source value through time sorting", () => {
    // Given two readings for the same lane with different selection values
    const statements = [
      rows(
        [
          ["ts", "TIMESTAMP"],
          ["lane", "SYMBOL"],
          ["state", "SYMBOL"],
          ["cluster_code", "SYMBOL"],
        ],
        [
          ["2026-01-01T00:01:00Z", "host", "up", "west"],
          ["2026-01-01T00:00:00Z", "host", "up", "east"],
        ],
      ),
    ]
    const { option } = stateTimelineOption({
      visual: { type: "stateTimeline" },
      formats: {},
      colors: lightColors,
      statements,
    })

    // When each segment is clicked, then it uses the value from its own row
    const [state] = series(option)
    expect(
      (state.data as unknown[]).map((data) =>
        clickWrites(statements, "cluster_code", data),
      ),
    ).toEqual(["'east'", "'west'"])
    // And an unbound click selects the segment's lane
    expect(
      clickWrites(statements, undefined, (state.data as unknown[])[0]),
    ).toBe("'host'")
  })
  const states = rows(
    [
      ["ts", "TIMESTAMP"],
      ["robot", "SYMBOL"],
      ["state", "SYMBOL"],
    ],
    [
      ["2026-01-01T00:00:00.000000Z", "R-10", "error"],
      ["2026-01-01T00:00:00.000000Z", "R-2", "charging"],
      ["2026-01-01T00:00:00.000000Z", "R-1", "picking"],
      ["2026-01-01T01:00:00.000000Z", "R-1", "moving"],
    ],
  )

  it("escapes lane and state names in its tooltip", () => {
    // Given a lane named with markup, as any writer could ingest
    const ctx = {
      visual: { type: "stateTimeline" as const },
      statements: [
        rows(
          [
            ["ts", "TIMESTAMP"],
            ["robot", "SYMBOL"],
            ["state", "SYMBOL"],
          ],
          [["2026-01-01T00:00:00.000000Z", "<img src=x>", "<b>up"]],
        ),
      ],
      colors: lightColors,
      formats: {},
    }

    // When
    const { option } = stateTimelineOption(ctx)
    const formatter = (
      option as { tooltip: { formatter: (p: unknown) => string } }
    ).tooltip.formatter
    const html = formatter({ value: [0, 60000, 0, 0] })

    // Then
    expect(html).not.toContain("<img")
    expect(html).toContain("&lt;img src=x&gt;")
    expect(html).toContain("&lt;b&gt;up")
  })

  it("orders lanes naturally and states by severity, coloured by meaning", () => {
    // Given
    const ctx = {
      visual: { type: "stateTimeline" as const },
      statements: [states],
      colors: lightColors,
      formats: {},
    }

    // When
    const { option } = stateTimelineOption(ctx)

    // Then
    const yAxis = (option as { yAxis: { data: string[] } }).yAxis
    expect(yAxis.data).toEqual(["R-1", "R-2", "R-10"])
    const stateSeries = series(option)
    expect(stateSeries.map((s) => s.name)).toEqual([
      "moving",
      "picking",
      "charging",
      "error",
    ])
    expect(
      stateSeries.map((s) =>
        (s.data as { value: number[] }[])[0].value.slice(2),
      ),
    ).toEqual([
      [0, 0],
      [0, 1],
      [1, 2],
      [2, 3],
    ])
    const colorOf = (name: string) =>
      (
        series(option).find((s) => s.name === name) as {
          itemStyle: { color: string }
        }
      ).itemStyle.color
    expect(colorOf("moving")).toBe(lightColors.chartUp)
    expect(colorOf("charging")).toBe(lightColors.statusWarning)
    expect(colorOf("error")).toBe(lightColors.chartDown)
  })
})

it("sets an unbound liquidity heatmap click to the cell's time, not epoch ms", () => {
  // Given a liquidity heatmap whose click keeps the default (no column)
  const statements = [
    rows(
      [
        ["ts", "TIMESTAMP"],
        ["price", "DOUBLE"],
        ["size", "DOUBLE"],
      ],
      [["2026-01-01T00:00:00.000000Z", 100, 5]],
    ),
  ]
  const built = liquidityHeatmapOption({
    visual: { type: "liquidityHeatmap" },
    colors: lightColors,
    formats: {},
    statements,
  })
  const [cells] = built.option?.series as { data: unknown[] }[]

  // When the user clicks the cell, which ECharts gives no name
  const written = clickWrites(statements, undefined, cells.data[0], {
    name: "",
  })

  // Then the variable holds the time as a timestamp literal
  expect(written).toBe("'2026-01-01T00:00:00.000000Z'")
})

it("draws a liquidity heatmap's price line with a surface halo", () => {
  // Given a liquidity heatmap with a price line, in the dark theme
  const built = liquidityHeatmapOption({
    visual: { type: "liquidityHeatmap" },
    colors: darkColors,
    formats: {},
    statements: [
      rows(
        [
          ["ts", "TIMESTAMP"],
          ["price", "DOUBLE"],
          ["size", "DOUBLE"],
        ],
        [["2026-01-01T00:00:00Z", 100, 5]],
      ),
      rows(
        [
          ["ts", "TIMESTAMP"],
          ["mid", "DOUBLE"],
        ],
        [["2026-01-01T00:00:00Z", 100]],
      ),
    ],
  })
  // Then the light line keeps a dark edge over the brightest cells
  const line = (built.option?.series as { lineStyle?: object }[])[1]
  expect(line.lineStyle).toMatchObject({
    color: darkColors.contentPrimary,
    shadowColor: darkColors.surfaceInset,
  })
})

it("keeps a named liquidity bucket selection with the rendered row", () => {
  const statements = [
    rows(
      [
        ["ts", "TIMESTAMP"],
        ["price", "LONG"],
        ["size", "DOUBLE"],
      ],
      [["2026-01-01T00:00:00Z", "9007199254740993", 10]],
    ),
  ]
  const built = liquidityHeatmapOption({
    visual: { type: "liquidityHeatmap" },
    colors: lightColors,
    formats: {},
    statements,
  })
  const [cells] = built.option?.series as { data: unknown[] }[]
  expect(cells.data).toEqual([
    {
      value: [1767225600000, 9007199254740992, 10],
      pick: { statement: 0, rows: [0], column: 0 },
    },
  ])
  expect(clickWrites(statements, "price", cells.data[0])).toBe(
    "9007199254740993",
  )
})

it("retains exact leaf selections but doesn't pick among conflicting rows", () => {
  const statements = [
    rows(
      [
        ["symbol", "SYMBOL"],
        ["size", "INT"],
        ["instrument", "LONG"],
      ],
      [
        ["Alpha", 1, "9007199254740993"],
        ["Beta", 2, "101"],
        ["Beta", 3, "102"],
      ],
    ),
  ]
  const result = treemapOption({
    visual: { type: "treemap", columns: { path: ["symbol"], value: "size" } },
    colors: lightColors,
    formats: {},
    statements,
  })
  const [series] = result.option?.series as { data: unknown[] }[]
  expect(series.data[0]).toMatchObject({ name: "Alpha" })
  expect(clickWrites(statements, "instrument", series.data[0])).toBe(
    "9007199254740993",
  )
  expect(series.data[1]).toMatchObject({ name: "Beta", value: 5 })
  expect(clickWrites(statements, "instrument", series.data[1])).toBeUndefined()
  expect(clickWrites(statements, undefined, series.data[1])).toBe("'Beta'")
})

it("reports a liquidity heatmap with no drawable cells", () => {
  const result = liquidityHeatmapOption({
    visual: { type: "liquidityHeatmap" },
    colors: lightColors,
    formats: {},
    statements: [
      {
        columns: [
          { name: "ts", type: "TIMESTAMP" },
          { name: "price", type: "INT" },
          { name: "amount", type: "DOUBLE" },
        ],
        rows: [["2026-01-01T00:00:00Z", 10, null]],
      },
    ],
  })
  expect(result.option).toBeNull()
  expect(result.problems[0]?.message).toContain("No drawable liquidity")
})

it("explicitly clears obsolete point-map bounds for a global frame", () => {
  const build = (points: number[][]) =>
    mapOption({
      visual: { type: "map" },
      formats: {},
      colors: lightColors,
      statements: [
        rows(
          [
            ["lat", "DOUBLE"],
            ["lon", "DOUBLE"],
          ],
          points,
        ),
      ],
    }).option
  expect(
    build([
      [37, -122],
      [38, -120],
    ])?.geo,
  ).toHaveProperty("boundingCoords.0.0", -126)
  expect(
    build([
      [37, -122],
      [35, 139],
    ])?.geo,
  ).toMatchObject({ boundingCoords: null })
})

it("outlines Dark Treemap labels with the chart surface on palette tiles", () => {
  const { option } = treemapOption({
    visual: { type: "treemap" },
    formats: {},
    colors: darkColors,
    statements: [
      rows(
        [
          ["market", "SYMBOL"],
          ["volume", "INT"],
        ],
        [
          ["Alpha", 10],
          ["Beta", 10],
        ],
      ),
    ],
  })
  const { rich } = series(option)[0].label as {
    rich: Record<"name" | "value", Record<string, unknown>>
  }
  for (const style of [rich.name, rich.value]) {
    expect(style).toMatchObject({
      color: darkColors.contentPrimary,
      textBorderColor: darkColors.surfaceInset,
      textBorderWidth: 3,
    })
    expect(style.opacity).toBeUndefined()
  }
})

it("gives Sunburst labels a theme surface independent of the sector fill", () => {
  const { option } = sunburstOption({
    visual: { type: "sunburst" },
    formats: {},
    colors: lightColors,
    statements: [
      rows(
        [
          ["market", "SYMBOL"],
          ["volume", "INT"],
        ],
        [
          ["Alpha", 10],
          ["Beta", 10],
        ],
      ),
    ],
  })
  expect(series(option)[0].label).toMatchObject({
    color: lightColors.contentPrimary,
    backgroundColor: lightColors.surfaceInset,
  })
})

it("sizes World map points by magnitude when every value is negative", () => {
  const { option } = mapOption({
    visual: { type: "map" },
    formats: {},
    colors: lightColors,
    statements: [
      rows(
        [
          ["lat", "DOUBLE"],
          ["lon", "DOUBLE"],
          ["pnl", "DOUBLE"],
        ],
        [
          [37, -122, -100],
          [35, 139, -1],
          [51, 0, -0.001],
        ],
      ),
    ],
  })
  const [points] = series(option)
  const sizeOf = points.symbolSize as (value: number[]) => number
  const sizes = (points.data as { value: number[] }[]).map((d) =>
    sizeOf(d.value),
  )
  // Then the largest loss gets the largest point, and all stay within 6–24 px
  expect(sizes[0]).toBe(24)
  for (const size of sizes) {
    expect(size).toBeGreaterThanOrEqual(6)
    expect(size).toBeLessThanOrEqual(24)
  }
})

it("scales a World map's region colours over its real values, not NULL as 0", () => {
  const { option } = mapOption({
    visual: { type: "map" },
    formats: {},
    colors: lightColors,
    statements: [
      rows(
        [
          ["country", "SYMBOL"],
          ["gdp", "DOUBLE"],
        ],
        [
          ["France", 40],
          ["Germany", 50],
          ["Spain", null],
        ],
      ),
    ],
  })
  // Then the scale runs from the lowest to the highest reported value
  expect(option?.visualMap).toMatchObject({ min: 40, max: 50 })
  // And the lowest value is not drawn like a country with no data
  const [map] = series(option)
  const noData = (map.itemStyle as { areaColor: string }).areaColor
  const ramp = (option?.visualMap as { inRange: { color: string[] } }).inRange
    .color
  expect(ramp[0]).not.toBe(noData)
})

it("sets no variable for an unbound click on a World map point with no name", () => {
  // Given lat/lon points with no label column
  const statements = [
    rows(
      [
        ["lat", "DOUBLE"],
        ["lon", "DOUBLE"],
        ["mag", "DOUBLE"],
      ],
      [[51.5, -0.12, 3]],
    ),
  ]
  const { option } = mapOption({
    visual: { type: "map" },
    formats: {},
    colors: lightColors,
    statements,
  })
  const [points] = series(option)

  // When the user clicks a point, whose value starts with its longitude
  const written = clickWrites(
    statements,
    undefined,
    (points.data as unknown[])[0],
    { name: "", value: [-0.12, 51.5, 3] },
  )

  // Then the variable is not set to the longitude
  expect(written).toBeUndefined()
})

it("selects NULL for an unbound click on a World map point with a NULL label", () => {
  // Given lat/lon points labelled by city, one with no city
  const statements = [
    rows(
      [
        ["city", "SYMBOL"],
        ["lat", "DOUBLE"],
        ["lon", "DOUBLE"],
      ],
      [[null, 51.5, -0.12]],
    ),
  ]
  const { option } = mapOption({
    visual: { type: "map" },
    formats: {},
    colors: lightColors,
    statements,
  })
  const [points] = series(option)

  // When the user clicks that point
  const written = clickWrites(
    statements,
    undefined,
    (points.data as unknown[])[0],
    { name: "", value: [-0.12, 51.5, 1] },
  )

  // Then the variable is NULL, not the longitude
  expect(written).toBe("null")
})

it.each(["treemap", "sunburst"] as const)(
  "selects NULL for an unbound click on a %s node with a NULL path value",
  (type) => {
    // Given sectors, one of them NULL
    const build = type === "treemap" ? treemapOption : sunburstOption
    const statements = [
      rows(
        [
          ["sector", "SYMBOL"],
          ["volume", "DOUBLE"],
        ],
        [
          [null, 7],
          ["tech", 3],
        ],
      ),
    ]
    const { option } = build({
      visual: { type, columns: { path: ["sector"], value: "volume" } },
      formats: {},
      colors: lightColors,
      statements,
    })
    const [tree] = series(option)
    const nodes = tree.data as { name: string }[]

    // When the user clicks the NULL node, named "" and sized 7
    const written = clickWrites(
      statements,
      undefined,
      nodes.find((node) => node.name === ""),
      { name: "", value: 7 },
    )

    // Then the variable is NULL, not the size
    expect(written).toBe("null")
  },
)

it("selects NULL for an unbound click on a state timeline segment of a NULL lane", () => {
  // Given a lane with no name
  const statements = [
    rows(
      [
        ["ts", "TIMESTAMP"],
        ["host", "SYMBOL"],
        ["state", "SYMBOL"],
      ],
      [["2026-01-01T00:00:00Z", null, "up"]],
    ),
  ]
  const { option } = stateTimelineOption({
    visual: { type: "stateTimeline" },
    formats: {},
    colors: lightColors,
    statements,
  })
  const [segments] = series(option)

  // When the user clicks its segment, which ECharts names ""
  const written = clickWrites(
    statements,
    undefined,
    (segments.data as unknown[])[0],
    { name: "", value: (segments.data as { value: number[] }[])[0].value },
  )

  // Then the variable is NULL, not the segment's start time
  expect(written).toBe("null")
})

it("keeps a World map point with a NULL value missing, not 0", () => {
  const { option } = mapOption({
    visual: { type: "map" },
    formats: {},
    colors: lightColors,
    statements: [
      rows(
        [
          ["city", "SYMBOL"],
          ["lat", "DOUBLE"],
          ["lon", "DOUBLE"],
          ["temp", "DOUBLE"],
        ],
        [
          ["London", 51.5, -0.12, null],
          ["Paris", 48.8, 2.35, 0],
          ["Berlin", 52.5, 13.4, 10],
        ],
      ),
    ],
  })
  const [points] = series(option)
  const data = points.data as {
    value: (number | null)[]
    itemStyle?: { color?: string }
  }[]
  // Then the missing reading keeps no value and is drawn hollow
  expect(data[0].value[2]).toBeNull()
  expect(data[0].itemStyle?.color).toBe("transparent")
  // And a real 0 is drawn as a filled point
  expect(data[1].value[2]).toBe(0)
  expect(data[1].itemStyle).toBeUndefined()
  // And the tooltip shows a missing value, not 0
  const tooltip = (option?.tooltip as { formatter: (p: unknown) => string })
    .formatter
  expect(tooltip({ name: "London", value: data[0].value })).toBe("London<br/>—")
  expect(tooltip({ name: "Paris", value: data[1].value })).toBe("Paris<br/>0")
})

it("does not start World map ripples on a settled coordinate frame", () => {
  const { option } = mapOption({
    visual: { type: "map" },
    formats: {},
    colors: lightColors,
    statements: [
      rows(
        [
          ["lat", "DOUBLE"],
          ["lon", "DOUBLE"],
        ],
        [[37, -122]],
      ),
    ],
  })
  expect(series(option)[0]).toMatchObject({
    type: "effectScatter",
    showEffectOn: "emphasis",
  })
})

it("keeps the mapped point’s exact selection field separate from its coordinates", () => {
  const statements = [
    rows(
      [
        ["lat", "DOUBLE"],
        ["lon", "DOUBLE"],
        ["value", "INT"],
        ["site", "SYMBOL"],
      ],
      [[12, 34, 5, "west"]],
    ),
  ]
  const { option } = mapOption({
    visual: { type: "map" },
    formats: {},
    colors: lightColors,
    statements,
  })
  const [points] = series(option)
  expect(clickWrites(statements, "site", (points.data as unknown[])[0])).toBe(
    "'west'",
  )
})

describe("volumeProfileOption", () => {
  const common = { colors: lightColors, formats: {} }
  it("anchors POC to the winning bar, not a rounded display label", () => {
    const result = volumeProfileOption({
      ...common,
      visual: { type: "volumeProfile", columns: { value: "volume" } },
      formats: { price: { decimals: 0 } },
      statements: [
        rows(
          [
            ["price", "DOUBLE"],
            ["volume", "INT"],
          ],
          [
            [100.02, 12],
            [100.01, 5],
          ],
        ),
      ],
    })
    expect(result.option?.yAxis).toMatchObject({ data: ["100", "100"] })
    expect(result.option?.series).toMatchObject([
      { markLine: { data: [{ yAxis: 0 }] } },
    ])
  })
  it("does not mark a point of control for two absent volumes", () => {
    const rendered = volumeProfileOption({
      ...common,
      visual: { type: "volumeProfile", columns: { value: "volume" } },
      statements: [
        {
          columns: [
            { name: "price", type: "INT" },
            { name: "volume", type: "DOUBLE" },
          ],
          rows: [
            [10, null],
            [11, null],
          ],
        },
      ],
    })
    expect(rendered.drawn.pointOfControl).toBe("")
    expect(rendered.option?.series).toMatchObject([
      { data: [{ value: null }, { value: null }] },
    ])
    const series = rendered.option?.series as unknown[] | undefined
    expect(series?.[0]).toMatchObject({ markLine: { data: [] } })
  })
  it("reports a missing configured sell column instead of changing the point of control", () => {
    const result = volumeProfileOption({
      ...common,
      visual: { type: "volumeProfile", columns: { sell: "sell" } },
      statements: [
        rows(
          [
            ["price", "INT"],
            ["buy", "INT"],
            ["sales", "INT"],
          ],
          [
            [10, 4, 20],
            [11, 5, 0],
          ],
        ),
      ],
    })
    expect(result.option).toBeNull()
    expect(result.problems[0]?.message).toContain('column "sell" not found')
  })
  it.each([{ value: "volume" }, { buy: "volume" }])(
    "ranks exact LONG volumes for point of control (%j)",
    (columns) => {
      const result = volumeProfileOption({
        ...common,
        visual: { type: "volumeProfile", columns },
        statements: [
          rows(
            [
              ["price", "INT"],
              ["volume", "LONG"],
            ],
            [
              [101, "9007199254740992"],
              [100, "9007199254740993"],
            ],
          ),
        ],
      })
      expect(result.drawn.pointOfControl).toBe("100")
      expect(result.option?.series).toMatchObject([
        { markLine: { data: [{ yAxis: 1 }] } },
      ])
    },
  )
  it("keeps raw price metadata in split and single volume bars", () => {
    const statements = [
      rows(
        [
          ["price", "INT"],
          ["buy", "INT"],
          ["sell", "INT"],
        ],
        [
          [10, 4, 20],
          [11, 5, 0],
        ],
      ),
    ]
    const split = volumeProfileOption({
      ...common,
      visual: { type: "volumeProfile" },
      statements,
    })
    expect(split.drawn.pointOfControl).toBe("10")
    // Bars run from the highest price, each drawn from its own row
    const atPrice = (row: number) => ({
      pick: { statement: 0, rows: [row], column: 0 },
    })
    expect(split.option?.series).toMatchObject([
      {
        data: [
          { value: 5, ...atPrice(1) },
          { value: 4, ...atPrice(0) },
        ],
      },
      {
        data: [
          { value: 0, ...atPrice(1) },
          { value: 20, ...atPrice(0) },
        ],
      },
    ])
    const [buys] = split.option?.series as { data: unknown[] }[]
    expect(clickWrites(statements, "price", buys.data[0])).toBe("11")
    expect(clickWrites(statements, "sell", buys.data[0])).toBe("0")
    const single = volumeProfileOption({
      ...common,
      visual: { type: "volumeProfile", columns: { value: "buy" } },
      statements,
    })
    expect(single.option?.series).toMatchObject([
      {
        data: [
          { value: 5, ...atPrice(1) },
          { value: 4, ...atPrice(0) },
        ],
      },
    ])
  })
  it.each([
    ["DECIMAL(10,2)", "63000.50", { prefix: "$" }, "63000.50m"],
    ["DOUBLE", 63000.5, undefined, "63000.5"],
  ] as const)(
    "sets an unbound click on a %s price to the price, not its label",
    (type, price, format, literal) => {
      // Given a volume profile whose click keeps the default (no column)
      const statements = [
        rows(
          [
            ["price", type],
            ["volume", "DOUBLE"],
          ],
          [[price, 4]],
        ),
      ]
      const built = volumeProfileOption({
        colors: lightColors,
        formats: format ? { price: format } : {},
        visual: { type: "volumeProfile", columns: { value: "volume" } },
        statements,
      })
      const [bars] = built.option?.series as { data: unknown[] }[]

      // When the user clicks the bar, named by its formatted price label
      const written = clickWrites(statements, undefined, bars.data[0], {
        name: "$63,000.50",
      })

      // Then the variable holds the price as a number of its type
      expect(written).toBe(literal)
    },
  )
})

describe("sankeyOption", () => {
  it.each([2000, 2001])(
    "keeps Sankey layout bounded for %d complete links",
    (count) => {
      const built = sankeyOption({
        visual: { type: "sankey" },
        colors: lightColors,
        formats: {},
        statements: [
          rows(
            [
              ["source", "SYMBOL"],
              ["target", "SYMBOL"],
              ["weight", "INT"],
            ],
            Array.from({ length: count }, (_, i) => [
              `from-${i % 50}`,
              `to-${Math.floor(i / 50)}`,
              1,
            ]),
          ),
        ],
      })
      if (count === 2000) {
        expect(built.drawn.links).toBe(count)
        expect(built.option).not.toBeNull()
      } else {
        expect(built.option).toBeNull()
        expect(built.problems[0].message).toContain("limited to 2,000 links")
      }
    },
  )
  it("reports cycles instead of handing an unsupported flow to ECharts", () => {
    const option = sankeyOption({
      visual: { type: "sankey" },
      statements: [
        rows(
          [
            ["source", "SYMBOL"],
            ["target", "SYMBOL"],
          ],
          [
            ["orders", "workers"],
            ["workers", "orders"],
          ],
        ),
      ],
      colors: lightColors,
      formats: {},
    })
    expect(option.option).toBeNull()
    expect(option.problems[0]?.message).toContain("contain a cycle")
  })

  it("does not invent unit weights when an explicit weight column is missing", () => {
    const statements = [
      rows(
        [
          ["source", "SYMBOL"],
          ["target", "SYMBOL"],
        ],
        [["a", "b"]],
      ),
    ]
    const bound = sankeyOption({
      visual: { type: "sankey", columns: { value: "bytes" } },
      statements,
      colors: lightColors,
      formats: {},
    })
    expect(bound.option).toBeNull()
    expect(bound.problems[0]?.message).toContain('column "bytes" not found')
    const unbound = sankeyOption({
      visual: { type: "sankey" },
      statements,
      colors: lightColors,
      formats: {},
    })
    expect(unbound.option?.series).toMatchObject([{ links: [{ value: 1 }] }])
  })
})

describe("gaugeOption", () => {
  it("infers a parameterized QuestDB DECIMAL before a later integer", () => {
    const rendered = gaugeOption({
      visual: { type: "gauge" },
      colors: lightColors,
      formats: {},
      statements: [
        rows(
          [
            ["reading", "DECIMAL(10,2)"],
            ["count", "INT"],
          ],
          [["12.34", 2]],
        ),
      ],
    })
    expect(rendered.drawn.value).toBe("12.34")
  })
  it("rejects inverted effective bounds and formats the original LONG on a valid scale", () => {
    const build = (value: string, max?: number) =>
      gaugeOption({
        visual: { type: "gauge", max },
        statements: [rows([["reading", "LONG"]], [[value]])],
        colors: lightColors,
        formats: { reading: { kind: "number" } },
      })
    expect(build("-20", -10).problems[0]?.message).toContain(
      "maximum must be greater",
    )
    const rendered = build("9007199254740993")
    expect(rendered.drawn.value).toBe("9007199254740993")
    const series = rendered.option?.series as
      | { detail: { formatter?: () => string } }[]
      | undefined
    expect(series?.[1].detail.formatter?.()).toBe("9,007,199,254,740,993")
  })
  it("does not substitute another metric when the configured column disappears", () => {
    const result = gaugeOption({
      visual: { type: "gauge", columns: { value: "cpu_percent" } },
      statements: [
        { columns: [{ name: "memory_percent", type: "DOUBLE" }], rows: [[72]] },
      ],
      colors: lightColors,
      formats: {},
    })
    expect(result.option).toBeNull()
    expect(result.problems[0]?.message).toContain(
      'column "cpu_percent" not found',
    )
  })

  it("reports NULL as missing while keeping a genuine zero", () => {
    const build = (value: number | null) =>
      gaugeOption({
        visual: { type: "gauge" },
        statements: [
          { columns: [{ name: "value", type: "DOUBLE" }], rows: [[value]] },
        ],
        colors: lightColors,
        formats: {},
      })
    expect(build(null).option).toBeNull()
    expect(build(null).problems[0]?.message).toContain("No numeric value")
    expect(build(0).drawn.value).toBe(0)
  })

  it("shows the value large and only the scale ends as labels", () => {
    // Given
    const memory = rows([["bytes", "LONG"]], [[300]])

    // When
    const { option } = gaugeOption({
      visual: { type: "gauge", min: 0, max: 1000 },
      statements: [memory],
      colors: lightColors,
      formats: {},
    })

    // Then
    const progress = series(option).find(
      (s) => (s.progress as { show?: boolean } | undefined)?.show,
    ) as { data: { value: number }[]; detail: { fontSize: number } }
    expect(progress.data[0].value).toBe(300)
    expect(progress.detail.fontSize).toBeGreaterThanOrEqual(24)
  })
})

describe("statTiles", () => {
  it("bounds sparkline geometry while retaining endpoints and spikes", () => {
    const values = Array.from({ length: 9_600 }, () => 0)
    values[2_345] = -50
    values[2_346] = 50
    const points = sparklineGeometry(values).split(" ")
    const xs = points.map((p) => Number(p.split(",")[0]))
    expect(points.length).toBeLessThanOrEqual(202)
    expect(xs[0]).toBe(0)
    expect(xs.at(-1)).toBe(100)
    expect(xs).toEqual([...xs].sort((a, b) => a - b))
    expect(points.find((p) => p.endsWith(",28"))).toBeDefined()
    expect(points.find((p) => p.endsWith(",2"))).toBeDefined()
  })

  it("uses unlabeled history for every tile only when the history has no label column", () => {
    const summary = rows(
      [
        ["site", "SYMBOL"],
        ["value", "LONG"],
      ],
      [
        ["East", 2],
        ["West", 5],
      ],
    )
    const labeled = rows(
      [
        ["site", "SYMBOL"],
        ["value", "LONG"],
      ],
      [
        ["East", 1],
        ["East", 2],
        [null, 7],
        [null, 9],
      ],
    )
    const common = rows([["value", "LONG"]], [[7], [9]])
    const visual = { type: "stat" } as const

    expect(
      statTiles(visual, [summary, labeled]).tiles.map((tile) => tile.spark),
    ).toEqual([[1, 2], []])
    expect(
      statTiles(visual, [summary, common]).tiles.map((tile) => tile.spark),
    ).toEqual([
      [7, 9],
      [7, 9],
    ])
  })

  it("groups sparkline history by the configured label, not the first category", () => {
    const summary = rows(
      [
        ["region", "SYMBOL"],
        ["value", "LONG"],
      ],
      [
        ["East", 2],
        ["West", 5],
      ],
    )
    const history = rows(
      [
        ["replica", "SYMBOL"],
        ["region", "SYMBOL"],
        ["value", "LONG"],
      ],
      [
        ["West", "East", 1],
        ["West", "East", 2],
        ["East", "West", 9],
        ["East", "West", 5],
      ],
    )
    expect(
      statTiles({ type: "stat", columns: { label: "region" } }, [
        summary,
        history,
      ]).tiles.map((tile) => tile.spark),
    ).toEqual([
      [1, 2],
      [9, 5],
    ])
  })

  it("reads a caption column under each value", () => {
    // Given
    const summary = rows(
      [
        ["label", "STRING"],
        ["value", "LONG"],
        ["caption", "STRING"],
      ],
      [["Tables", 256, "254 use WAL"]],
    )

    // When
    const { tiles } = statTiles(
      { type: "stat", columns: { caption: "caption" } },
      [summary],
    )

    // Then
    expect(tiles[0]).toMatchObject({ label: "Tables", caption: "254 use WAL" })
  })
})

describe("bulletRows", () => {
  it("finds the target in a column named limit when none is given", () => {
    // Given
    const desks = rows(
      [
        ["desk", "SYMBOL"],
        ["var", "DOUBLE"],
        ["limit", "DOUBLE"],
      ],
      [["Spot", 40, 50]],
    )

    // When
    const read = bulletRows({ type: "bullet" }, desks)

    // Then
    expect(read).toMatchObject({ valueIdx: 1, targetIdx: 2, labelIdx: 0 })
  })
})

describe("visual tooltips", () => {
  it("escape formatted values, whose prefix and suffix come from formats", () => {
    // Given formats whose affixes are markup, as an import could carry
    const formats = {
      size: { prefix: "<img src=x ", suffix: " onerror=a>" },
      w: { prefix: "<b>" },
    }
    const tree = treemapOption({
      visual: { type: "treemap" as const },
      statements: [
        rows(
          [
            ["name", "SYMBOL"],
            ["size", "DOUBLE"],
          ],
          [["a", 1]],
        ),
      ],
      colors: lightColors,
      formats,
    })
    const graph = graphOption({
      visual: { type: "graph" as const },
      statements: [
        rows(
          [
            ["src", "SYMBOL"],
            ["dst", "SYMBOL"],
            ["w", "DOUBLE"],
          ],
          [["a", "b", 2]],
        ),
      ],
      colors: lightColors,
      formats,
    })
    const tooltip = (option: unknown) =>
      (option as { tooltip: { formatter: (p: unknown) => string } }).tooltip
        .formatter

    // When
    const treeHtml = tooltip(tree.option)({ name: "a", value: 1 })
    const edgeHtml = tooltip(graph.option)({
      dataType: "edge",
      data: { source: "a", target: "b", value: 2 },
    })

    // Then
    expect(treeHtml).not.toContain("<img")
    expect(treeHtml).toContain("&lt;img src=x")
    expect(edgeHtml).not.toContain("<b>2")
  })
})

describe("unbound clicks on flow visuals", () => {
  const flows = (source: string | null) =>
    rows(
      [
        ["src", "SYMBOL"],
        ["dst", "SYMBOL"],
        ["amount", "DOUBLE"],
      ],
      [
        [source, "b", 4],
        [null, "c", 3],
        ["a", "b", 5],
      ],
    )
  const build = { graph: graphOption, sankey: sankeyOption, chord: chordOption }

  it.each(["graph", "sankey", "chord"] as const)(
    "selects NULL, not the total flow, on a %s node of NULL endpoints",
    (type) => {
      // Given flows from a NULL source, total flow 7
      const statements = [flows(null)]
      const { option } = build[type]({
        visual: { type },
        colors: lightColors,
        formats: {},
        statements,
      })
      const nodes = series(option)[0].data as { name: string }[]

      // When the user clicks the unlabelled node
      const written = clickWrites(
        statements,
        undefined,
        nodes.find((node) => node.name === ""),
        { dataType: "node", name: "", value: 7 },
      )

      // Then the variable is NULL
      expect(written).toBe("null")
    },
  )

  it("does not claim NULL for a node that also stands for empty text", () => {
    // Given NULL and '' endpoints, which share one unlabelled node
    const statements = [flows("")]
    const { option } = sankeyOption({
      visual: { type: "sankey" },
      colors: lightColors,
      formats: {},
      statements,
    })

    // Then that node, whose rows disagree, selects nothing
    const nodes = series(option)[0].data as Record<string, unknown>[]
    const empty = nodes.find((node) => node.name === "")
    expect(clickWrites(statements, undefined, empty)).toBeUndefined()
    // And a node that is a source selects its source column
    const a = nodes.find((node) => node.name === "a")
    expect(clickWrites(statements, undefined, a)).toBe("'a'")
    expect(clickWrites(statements, "amount", a)).toBe("5")
  })

  it("sets nothing for an unbound click on a link, but the bound column for a bound one", () => {
    // Given a link between two exchanges
    const statements = [
      rows(
        [
          ["src", "SYMBOL"],
          ["dst", "SYMBOL"],
          ["amount", "DOUBLE"],
          ["route", "SYMBOL"],
        ],
        [["NYSE", "LSE", 4, "transatlantic"]],
      ),
    ]
    const { option } = sankeyOption({
      visual: { type: "sankey" },
      colors: lightColors,
      formats: {},
      statements,
    })
    const [link] = series(option)[0].links as unknown[]
    const edge = { dataType: "edge", name: "NYSE > LSE" }

    // When the user clicks the link with and without a bound column
    const unbound = clickWrites(statements, undefined, link, edge)
    const bound = clickWrites(statements, "route", link, edge)

    // Then only the bound click writes, and never the link's label
    expect(unbound).toBeUndefined()
    expect(bound).toBe("'transatlantic'")
  })
})

describe("footprintOption", () => {
  const levels = rows(
    [
      ["ts", "TIMESTAMP"],
      ["lvl", "DOUBLE"],
      ["buy", "DOUBLE"],
      ["sell", "DOUBLE"],
    ],
    [
      ["2026-01-01T10:00:00.000000Z", 100, 1, 4],
      ["2026-01-01T10:00:00.000000Z", 125, 9, 2],
      ["2026-01-01T10:15:00.000000Z", 125, 3, 3],
      ["2026-01-01T10:15:00.000000Z", 150, 2, 1],
    ],
  )
  type Cells = {
    renderItem: string
    itemPayload: Record<string, unknown>
    data: { value: number[]; tip: string }[]
  }

  it("outlines each bar's busiest level and spans the last bar", () => {
    // Given two 15-minute bars of $25 levels
    // When
    const result = footprintOption({
      visual: { type: "footprint" },
      statements: [levels],
      colors: lightColors,
      formats: {},
    })

    // Then each level is a cell [time, price, sell, buy, poc] of the built-in
    // footprint series, and the bar's point of control is flagged
    const [cells] = result.option?.series as Cells[]
    expect(cells.renderItem).toBe("footprint")
    expect(cells.itemPayload).toMatchObject({
      dt: 15 * 60_000,
      step: 25,
      sell: 2,
      buy: 3,
      poc: 4,
    })
    expect(cells.data.map((d) => d.value.slice(1))).toEqual([
      [100, 4, 1, 0],
      [125, 2, 9, 1],
      [125, 3, 3, 1],
      [150, 1, 2, 0],
    ])
    // And the axes end past the last bar and the top level
    const t0 = Date.parse("2026-01-01T10:00:00Z")
    expect(result.option?.xAxis).toMatchObject({
      min: t0,
      max: t0 + 30 * 60_000,
    })
    expect(result.option?.yAxis).toMatchObject({ min: 100, max: 175 })
    expect(cells.data[1].tip).toContain("2026-01-01 10:00")
  })

  it("draws each bar's candle beside its levels from statement 1", () => {
    // Given the bars' open, high, low and close as a second statement
    const candles = rows(
      [
        ["ts", "TIMESTAMP"],
        ["open", "DOUBLE"],
        ["high", "DOUBLE"],
        ["low", "DOUBLE"],
        ["close", "DOUBLE"],
      ],
      [
        ["2026-01-01T10:00:00.000000Z", 110, 160, 90, 140],
        ["2026-01-01T10:15:00.000000Z", 140, 155, 120, 130],
      ],
    )

    // When
    const result = footprintOption({
      visual: { type: "footprint" },
      statements: [levels, candles],
      colors: lightColors,
      formats: {},
    })

    // Then a candle series follows the cells, which leave room for it, and
    // the price axis holds the candles' highs and lows
    const [cells, candle] = result.option?.series as (Cells & {
      data: number[][]
    })[]
    expect(cells.itemPayload.inset).toBeGreaterThan(0.2)
    expect(candle.data).toHaveLength(2)
    expect(result.option?.yAxis).toMatchObject({ min: 90, max: 175 })
  })

  it("selects the clicked level's price", () => {
    // Given a footprint drawn from the levels
    const result = footprintOption({
      visual: { type: "footprint" },
      statements: [levels],
      colors: lightColors,
      formats: {},
    })
    const [cells] = result.option?.series as Cells[]

    // When the user clicks a cell, which ECharts gives no name
    const written = clickWrites([levels], undefined, cells.data[1], {
      name: "",
    })

    // Then the variable holds the level's price
    expect(written).toBe("125")
  })

  it("keeps a side with no volume unknown, and finds the busiest level exactly", () => {
    // Given LONG volumes past 2^53, and a level whose sell side is NULL
    const exact = rows(
      [
        ["ts", "TIMESTAMP"],
        ["lvl", "DOUBLE"],
        ["buy", "LONG"],
        ["sell", "LONG"],
      ],
      [
        ["2026-01-01T10:00:00.000000Z", 100, "9007199254740992", "0"],
        ["2026-01-01T10:00:00.000000Z", 125, "9007199254740993", "0"],
        ["2026-01-01T10:00:00.000000Z", 150, "5", null],
      ],
    )

    // When
    const result = footprintOption({
      visual: { type: "footprint" },
      statements: [exact],
      colors: lightColors,
      formats: {},
    })

    // Then the 125 level wins though both totals round to the same double,
    // and the NULL side stays unknown
    const [cells] = result.option?.series as Cells[]
    expect(cells.data.map((d) => d.value.slice(1))).toEqual([
      [100, 0, 9007199254740992, 0],
      [125, 0, 9007199254740992, 1],
      [150, null, 5, 0],
    ])
  })

  it("names a missing column", () => {
    // Given / When / Then
    expect(
      footprintOption({
        visual: { type: "footprint", columns: { sell: "asks" } },
        statements: [levels],
        colors: lightColors,
        formats: {},
      }).problems[0]?.message,
    ).toContain('sell: column "asks" not found')
  })
})
