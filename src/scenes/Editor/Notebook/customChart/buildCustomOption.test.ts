import { describe, expect, it } from "vitest"
import {
  buildCustomOption,
  chartNumber,
  customSeriesCount,
} from "./buildCustomOption"
import type { StatementRows } from "../visuals/statementRows"
import { echarts } from "../CellChart/echartsSetup"
import { mapsUsedBy } from "./maps"

const rows = (
  columns: [string, string][],
  data: (string | number)[][],
): StatementRows => ({
  columns: columns.map(([name, type]) => ({ name, type })),
  rows: data,
})

describe("buildCustomOption", () => {
  it("applies the data:-only image rule to symbols bound from rows", () => {
    // Given an option that binds a text column into a mark line's symbols
    const pixel = "image://data:image/png;base64,AAAA"
    const built = buildCustomOption(
      {
        series: [
          {
            type: "line",
            markLine: {
              symbol: { $rows: { shape: "column", column: "sym" } },
            },
          },
        ],
      },
      [
        rows(
          [["sym", "VARCHAR"]],
          [["image://https://example.com/leak.png?d=42"], [pixel], ["arrow"]],
        ),
      ],
      false,
    )

    // Then a query value cannot make the chart fetch another URL
    const [series] = built.option.series as {
      markLine: { symbol: string[] }
    }[]
    expect(series.markLine.symbol).toEqual(["circle", pixel, "arrow"])
    expect(built.problems).toContainEqual({
      path: "series[0].markLine.symbol[0]",
      message: "Only data: images are allowed; the symbol is a circle.",
      severity: "warning",
    })
  })

  it("warns when a filter can only see a partial statement dataset", () => {
    const built = buildCustomOption(
      {
        dataset: [
          {
            id: "alerts",
            fromDatasetId: "q0",
            transform: {
              type: "filter",
              config: { dimension: "state", "=": "ALERT" },
            },
          },
        ],
        series: [{ type: "scatter", datasetId: "alerts" }],
      },
      [{ ...rows([["state", "SYMBOL"]], [["OK"]]), partial: true }],
      true,
    )
    expect(
      built.problems.some(
        ({ severity, message }) =>
          severity === "warning" && message.includes("returned only part"),
      ),
    ).toBe(true)
  })
  it("loads maps used only by nested chart options", () => {
    expect(
      mapsUsedBy({
        baseOption: { geo: { map: "world" } },
        media: [{ option: { series: [{ type: "map", map: "world" }] } }],
      }),
    ).toEqual(["world"])
  })

  it("plots statement rows from the effective ECharts base option", () => {
    // Given a nested line series bound to the first statement
    const { option, problems } = buildCustomOption(
      {
        baseOption: {
          xAxis: { type: "category" },
          yAxis: { type: "value" },
          series: [
            {
              type: "line",
              datasetId: "q0",
              encode: { x: "station", y: "volume" },
            },
          ],
        },
      },
      [
        rows(
          [
            ["station", "SYMBOL"],
            ["volume", "INT"],
          ],
          [
            ["east", 1],
            ["west", 2],
          ],
        ),
      ],
      true,
    )
    const chart = echarts.init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 800,
      height: 400,
    })
    try {
      // When ECharts resolves the chart, then its series gets both query rows
      chart.setOption(option)
      expect(problems).toEqual([])
      expect(chart.getOption()).toMatchObject({
        animation: false,
        dataset: [{ id: "q0" }],
      })
      expect(chart.renderToSVGString()).toContain("west")
      expect(customSeriesCount(option)).toBe(1)
    } finally {
      chart.dispose()
    }
  })

  it("does not build query-bound flow links from partial rows", () => {
    const built = buildCustomOption(
      { series: [{ type: "sankey", links: { $rows: { shape: "links" } } }] },
      [
        {
          ...rows(
            [
              ["from", "SYMBOL"],
              ["to", "SYMBOL"],
              ["size", "INT"],
            ],
            [["A", "B", 1]],
          ),
          partial: true,
        },
      ],
      false,
    )
    expect(built.option).toEqual({})
    expect(built.problems[0]?.message).toContain("part of its rows")
  })

  it("makes incomplete tree bindings a chart-level error", () => {
    // Given a custom tree based on an incomplete statement result
    const built = buildCustomOption(
      {
        series: [
          {
            type: "treemap",
            data: { $rows: { shape: "tree", path: ["desk"], value: "volume" } },
          },
        ],
      },
      [
        {
          ...rows(
            [
              ["desk", "SYMBOL"],
              ["volume", "INT"],
            ],
            [["east", 5]],
          ),
          partial: true,
        },
      ],
      false,
    )

    // Then the pane can show a fatal diagnostic instead of a partial total
    expect(built.option).toEqual({})
    expect(built.problems[0]?.path).toBe("")
    expect(built.problems[0]?.severity).toBe("error")
    expect(built.problems[0]?.message).toContain("Aggregate by path in SQL")
  })

  it("rejects Custom Sankey edges beyond the shared layout budget", () => {
    const built = buildCustomOption(
      {
        series: {
          type: "sankey",
          links: {
            $rows: {
              shape: "links",
              from: "source",
              to: "target",
              value: "weight",
            },
          },
        },
      },
      [
        rows(
          [
            ["source", "SYMBOL"],
            ["target", "SYMBOL"],
            ["weight", "INT"],
          ],
          Array.from({ length: 2001 }, (_, index) => [
            "hub",
            `site-${index}`,
            1,
          ]),
        ),
      ],
      true,
    )
    expect(built.option).toEqual({})
    expect(built.problems[0]?.message).toContain("limited to 2,000 links")
  })

  it("diagnoses a cycle after binding Sankey query rows", () => {
    const option = {
      series: [
        {
          type: "sankey",
          links: {
            $rows: { query: 0, shape: "links", source: "from", target: "to" },
          },
        },
      ],
    }
    const edgeRows = (data: string[][]) => [
      rows(
        [
          ["from", "SYMBOL"],
          ["to", "SYMBOL"],
        ],
        data,
      ),
    ]
    const cyclic = buildCustomOption(
      option,
      edgeRows([
        ["a", "b"],
        ["b", "a"],
      ]),
      false,
    )
    expect(cyclic.option).toEqual({})
    expect(cyclic.problems[0]?.severity).toBe("error")
    expect(cyclic.problems[0]?.message).toContain("contain a cycle")
    expect(
      buildCustomOption(
        option,
        edgeRows([
          ["a", "b"],
          ["b", "c"],
        ]),
        false,
      ).problems,
    ).toEqual([])
  })
  it("does not merge distinct, exactly representable LONGs", () => {
    expect([
      chartNumber("9007199254740990"),
      chartNumber("9007199254740991"),
    ]).toEqual([9_007_199_254_740_990, 9_007_199_254_740_991])
  })
  it("keeps tooltips on the chart renderer after binding and in nested options", () => {
    const { option } = buildCustomOption(
      {
        tooltip: { trigger: "axis" },
        series: [{ type: "bar", tooltip: { formatter: "Series {b}" } }],
        media: [{ option: { tooltip: "Media {b}" } }],
      },
      [],
      false,
    )
    expect(option).toMatchObject({
      tooltip: { trigger: "axis", renderMode: "richText", confine: true },
      series: [
        { tooltip: { formatter: "Series {b}", renderMode: "richText" } },
      ],
      media: [
        {
          option: {
            tooltip: { formatter: "Media {b}", renderMode: "richText" },
          },
        },
      ],
    })
  })

  it("removes external navigation from treemap nodes without disabling drill-down", () => {
    const { option } = buildCustomOption(
      {
        series: [
          {
            type: "treemap",
            nodeClick: "zoomToNode",
            data: [
              {
                name: "Region",
                children: [
                  {
                    name: "Desk",
                    value: 3,
                    link: "https://example.com/report",
                    target: "blank",
                  },
                ],
              },
            ],
          },
        ],
      },
      [],
      false,
    )
    expect(option.series).toEqual([
      {
        type: "treemap",
        nodeClick: "zoomToNode",
        data: [{ name: "Region", children: [{ name: "Desk", value: 3 }] }],
      },
    ])
  })

  it("removes sunburst navigation inherited from the series and its levels", () => {
    const { option } = buildCustomOption(
      {
        series: [
          {
            type: "sunburst",
            nodeClick: "link",
            link: "https://example.com/report",
            target: "blank",
            levels: [{}, { link: "https://example.com/level", r0: 10 }],
            data: [{ name: "Desk", value: 3 }],
          },
        ],
      },
      [],
      false,
    )
    expect(option.series).toEqual([
      {
        type: "sunburst",
        nodeClick: "link",
        levels: [{}, { r0: 10 }],
        data: [{ name: "Desk", value: 3 }],
      },
    ])
  })

  it("removes navigation metadata from titles at the renderer boundary", () => {
    const title = {
      text: "Daily volume",
      link: "https://example.com/report",
      target: "blank",
    }
    const { option } = buildCustomOption(
      { title, baseOption: { title: [title] }, media: [{ option: { title } }] },
      [],
      false,
    )
    expect(option.title).toEqual({ text: "Daily volume" })
    const base = option.baseOption as { title: unknown[] }
    expect(base.title).toEqual([{ text: "Daily volume" }])
    expect(option.media).toEqual([
      { option: { title: { text: "Daily volume" } } },
    ])
  })

  it("puts each statement first as a dataset q<i>", () => {
    // Given
    const trades = rows(
      [
        ["ts", "TIMESTAMP"],
        ["price", "DOUBLE"],
      ],
      [["2026-01-01T00:00:00.000000Z", 1]],
    )

    // When
    const { option } = buildCustomOption(
      {
        dataset: [{ id: "f", fromDatasetId: "q0" }],
        series: [
          { type: "line", datasetId: "q0", encode: { x: "ts", y: "price" } },
        ],
      },
      [trades],
      false,
    )

    // Then
    const datasets = option.dataset as { id: string }[]
    expect(datasets.map((d) => d.id)).toEqual(["q0", "f"])
    expect(datasets[0]).toMatchObject({
      dimensions: [
        { name: "ts", type: "time" },
        { name: "price", type: "float" },
      ],
    })
  })

  it("reports encode columns missing from the dataset", () => {
    // Given
    const trades = rows([["price", "DOUBLE"]], [[1]])

    // When
    const { problems } = buildCustomOption(
      { series: [{ type: "line", datasetId: "q0", encode: { y: "qty" } }] },
      [trades],
      false,
    )

    // Then
    expect(problems[0].message).toContain('"qty"')
  })

  it("fills $rows placeholders in the shape a series needs", () => {
    // Given
    const flows = rows(
      [
        ["src", "SYMBOL"],
        ["dst", "SYMBOL"],
        ["mw", "DOUBLE"],
      ],
      [
        ["Solar", "Grid", 10],
        ["Grid", "Homes", 8],
      ],
    )

    // When
    const { option } = buildCustomOption(
      {
        series: [
          {
            type: "sankey",
            data: { $rows: { shape: "nodes" } },
            links: { $rows: { shape: "links", value: "mw" } },
          },
        ],
      },
      [flows],
      true,
    )

    // Then
    const [sankey] = option.series as { data: unknown; links: unknown }[]
    expect(sankey.data).toEqual([
      { name: "Solar" },
      { name: "Grid" },
      { name: "Homes" },
    ])
    expect(sankey.links).toEqual([
      { source: "Solar", target: "Grid", value: 10 },
      { source: "Grid", target: "Homes", value: 8 },
    ])
    expect(option.animation).toBe(false)
  })

  it("builds a tree from path columns", () => {
    // Given
    const caps = rows(
      [
        ["sector", "SYMBOL"],
        ["sym", "SYMBOL"],
        ["cap", "DOUBLE"],
      ],
      [
        ["Tech", "A", 2],
        ["Tech", "B", 3],
        ["Energy", "C", 5],
      ],
    )

    // When
    const { option } = buildCustomOption(
      {
        series: [
          {
            type: "treemap",
            data: {
              $rows: { shape: "tree", path: ["sector", "sym"], value: "cap" },
            },
          },
        ],
      },
      [caps],
      false,
    )

    // Then
    const [treemap] = option.series as { data: unknown }[]
    expect(treemap.data).toEqual([
      {
        name: "Tech",
        value: 5,
        children: [
          { name: "A", value: 2 },
          { name: "B", value: 3 },
        ],
      },
      { name: "Energy", value: 5, children: [{ name: "C", value: 5 }] },
    ])
  })

  it("shapes routes for a lines series", () => {
    // Given
    const routes = rows(
      [
        ["route", "STRING"],
        ["lon1", "DOUBLE"],
        ["lat1", "DOUBLE"],
        ["lon2", "DOUBLE"],
        ["lat2", "DOUBLE"],
        ["flights", "LONG"],
      ],
      [["LHR-JFK", -0.45, 51.47, -73.78, 40.64, 42]],
    )

    // When
    const { option } = buildCustomOption(
      {
        series: [
          {
            type: "lines",
            data: {
              $rows: {
                shape: "lines",
                columns: ["lon1", "lat1", "lon2", "lat2"],
                name: "route",
                value: "flights",
              },
            },
          },
        ],
      },
      [routes],
      false,
    )

    // Then
    const series = option.series as { data: unknown[] }[]
    expect(series[0].data).toEqual([
      {
        name: "LHR-JFK",
        coords: [
          [-0.45, 51.47],
          [-73.78, 40.64],
        ],
        value: 42,
      },
    ])
  })

  it("turns LONG strings into numbers in tuples", () => {
    // Given LONG values as the HTTP client returns them
    const counts = rows(
      [
        ["hour", "LONG"],
        ["day", "SYMBOL"],
      ],
      [["7", "Mon"]],
    )

    // When
    const { option } = buildCustomOption(
      { series: [{ type: "heatmap", data: { $rows: { shape: "tuples" } } }] },
      [counts],
      false,
    )

    // Then
    const series = option.series as { data: unknown[] }[]
    expect(series[0].data).toEqual([[7, "Mon"]])
  })

  it("keeps headerless SQL rows and exact IDs in chart event data", () => {
    const data = rows(
      [
        ["ts", "TIMESTAMP"],
        ["id", "LONG"],
      ],
      [
        ["2026-01-01T00:00:00Z", "9007199254740993"],
        ["2026-01-02T00:00:00Z", "9007199254740992"],
      ],
    )
    const { option } = buildCustomOption(
      {
        xAxis: { type: "time" },
        yAxis: { type: "value" },
        series: [
          { type: "scatter", datasetId: "q0", encode: { x: "ts", y: "id" } },
        ],
      },
      [data],
      false,
    )
    const chart = echarts.init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 640,
      height: 360,
    })
    try {
      chart.setOption(option)
      expect(option.dataset).toMatchObject([
        { id: "q0", sourceHeader: false, source: data.rows },
      ])
      expect(chart.getOption().dataset).toMatchObject([{ source: data.rows }])
    } finally {
      chart.dispose()
    }
  })

  it("preserves distinct doubles in the plotted dataset", () => {
    const measured = [[4.1], [4.1000000000000005]]
    const latency = rows([["ms", "DOUBLE"]], measured)

    // When
    const { option } = buildCustomOption({}, [latency], false)

    // Then
    const [q0] = option.dataset as { source: unknown[][] }[]
    expect(q0.source).toEqual(measured)
  })
})
