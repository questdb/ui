import { describe, expect, it } from "vitest"
import { lightColors } from "../../../../theme"
import {
  gaugeOption,
  graphOption,
  liquidityHeatmapOption,
  mapOption,
  sankeyOption,
  stateTimelineOption,
  treemapOption,
  volumeProfileOption,
} from "./visualOptions"
import { statTiles } from "./StatTiles"
import { bulletRows } from "./Bullets"
import { clickedValue } from "../interactions/chartInteractions"
import type { StatementRows } from "./statementRows"

const rows = (
  columns: [string, string][],
  data: (string | number | boolean)[][],
): StatementRows => ({
  columns: columns.map(([name, type]) => ({ name, type })),
  rows: data,
})

const series = (option: unknown) =>
  (option as { series: Record<string, unknown>[] }).series

it("reads the bound gauge click value from its first row, not its reading or label", () => {
  // Given a gauge with a clamped reading and a separate selection column
  const { option } = gaugeOption({
    visual: { type: "gauge", max: 50 },
    colors: lightColors,
    formats: {},
    clickColumn: "station",
    statements: [
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
    ],
  })

  // When the non-silent progress series is clicked
  const [{ silent }, { data }] = series(option)
  const datum = (data as { value: number }[])[0]

  // Then the interaction uses the raw bound column
  expect(silent).toBe(true)
  expect(datum.value).toBe(50)
  expect(clickedValue({ data: datum }, "station")).toBe("east")
})

it("retains a graph edge's query column for selection", () => {
  const { option } = graphOption({
    visual: { type: "graph" },
    colors: lightColors,
    formats: {},
    clickColumn: "route",
    statements: [
      rows(
        [
          ["from", "SYMBOL"],
          ["to", "SYMBOL"],
          ["weight", "INT"],
          ["route", "SYMBOL"],
        ],
        [["east", "west", 1, "r1"]],
      ),
    ],
  })
  const [graph] = series(option)
  expect(clickedValue({ data: (graph.links as unknown[])[0] }, "route")).toBe(
    "r1",
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
    const { option } = stateTimelineOption({
      visual: { type: "stateTimeline" },
      formats: {},
      colors: lightColors,
      clickColumn: "cluster_code",
      statements: [
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
      ],
    })

    // When each segment is clicked, then it uses the value from its own row
    const [state] = series(option)
    expect(
      (state.data as unknown[]).map((data) =>
        clickedValue({ data }, "cluster_code"),
      ),
    ).toEqual(["east", "west"])
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
    expect(stateSeries.map((s) => (s.data as number[][])[0].slice(2))).toEqual([
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

it("keeps a named liquidity bucket selection with the rendered row", () => {
  const built = liquidityHeatmapOption({
    visual: { type: "liquidityHeatmap" },
    colors: lightColors,
    formats: {},
    clickColumn: "price",
    statements: [
      rows(
        [
          ["ts", "TIMESTAMP"],
          ["price", "LONG"],
          ["size", "DOUBLE"],
        ],
        [["2026-01-01T00:00:00Z", "9007199254740993", 10]],
      ),
    ],
  })
  expect(built.option?.series).toMatchObject([
    {
      data: [
        {
          value: [1767225600000, 9007199254740992, 10],
          columns: { price: "9007199254740993" },
        },
      ],
    },
  ])
})

it("withholds a liquidity heatmap when the bucket grid is incomplete", () => {
  const result = liquidityHeatmapOption({
    visual: { type: "liquidityHeatmap" },
    colors: lightColors,
    formats: {},
    statements: [
      {
        ...rows(
          [
            ["ts", "TIMESTAMP"],
            ["price", "DOUBLE"],
            ["size", "DOUBLE"],
          ],
          [["2026-01-01T00:00:00Z", 10, 1]],
        ),
        partial: true,
      },
    ],
  })
  expect(result.option).toBeNull()
  expect(result.problems[0].message).toContain("complete set of buckets")
})

it("retains exact leaf selections but doesn't pick among conflicting rows", () => {
  const result = treemapOption({
    visual: { type: "treemap", columns: { path: ["symbol"], value: "size" } },
    colors: lightColors,
    formats: {},
    clickColumn: "instrument",
    statements: [
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
    ],
  })
  const [series] = result.option?.series as { data: unknown[] }[]
  expect(series.data[0]).toMatchObject({
    name: "Alpha",
    columns: { instrument: "9007199254740993" },
  })
  expect(series.data[1]).toMatchObject({ name: "Beta", value: 5 })
  expect(series.data[1]).not.toHaveProperty("columns")
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

it("keeps the mapped point’s exact selection field separate from its coordinates", () => {
  const { option } = mapOption({
    visual: { type: "map" },
    formats: {},
    colors: lightColors,
    clickColumn: "site",
    statements: [
      rows(
        [
          ["lat", "DOUBLE"],
          ["lon", "DOUBLE"],
          ["value", "INT"],
          ["site", "SYMBOL"],
        ],
        [[12, 34, 5, "west"]],
      ),
    ],
  })
  const [points] = series(option)
  expect(clickedValue({ data: (points.data as unknown[])[0] }, "site")).toBe(
    "west",
  )
})

describe("volumeProfileOption", () => {
  it("does not report point of control for a capped prefix", () => {
    const result = volumeProfileOption({
      visual: { type: "volumeProfile" },
      statements: [
        {
          ...rows(
            [
              ["price", "DOUBLE"],
              ["volume", "DOUBLE"],
            ],
            [[10, 2]],
          ),
          partial: true,
        },
      ],
      colors: lightColors,
      formats: {},
    })
    expect(result.option).toBeNull()
    expect(result.problems[0]?.message).toContain("requires a complete result")
  })
  const common = { colors: lightColors, formats: {}, clickColumn: "price" }
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
    expect(split.option?.series).toMatchObject([
      {
        data: [
          { value: 5, columns: { price: 11 } },
          { value: 4, columns: { price: 10 } },
        ],
      },
      {
        data: [
          { value: 0, columns: { price: 11 } },
          { value: 20, columns: { price: 10 } },
        ],
      },
    ])
    const single = volumeProfileOption({
      ...common,
      visual: { type: "volumeProfile", columns: { value: "buy" } },
      statements,
    })
    expect(single.option?.series).toMatchObject([
      {
        data: [
          { value: 5, columns: { price: 11 } },
          { value: 4, columns: { price: 10 } },
        ],
      },
    ])
  })
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
