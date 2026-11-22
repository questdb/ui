import { describe, expect, it, vi } from "vitest"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import {
  buildEchartsOption,
  spanLabel,
  timeCategoryLabels,
  withZoomDensity,
  type ResolvedQuery,
} from "./buildEchartsOption"
import {
  areaRangeRenderItem,
  barRangeRenderItem,
  echarts,
} from "./echartsSetup"
import { chartZoomDensity } from "./chartDensity"
import {
  availableChartTypes,
  groupColumns,
  guessRoleColumns,
} from "./inferChartConfig"
import {
  drawProblems,
  resolveDraw,
  resolveRoles,
} from "../DrawCanvas/drawCanvasUtils"
import {
  clickedValue,
  interactionEvents,
} from "../interactions/chartInteractions"

const col = (name: string, type: string): ColumnDefinition => ({ name, type })

const query = (over: Partial<ResolvedQuery>): ResolvedQuery => ({
  index: 0,
  columns: [],
  dataset: [],
  xColumn: null,
  type: "line",
  yColumns: [],
  axis: "left",
  ...over,
})

const seriesOf = (option: unknown) =>
  (option as { series: Record<string, unknown>[] }).series

describe("preset chart interactions", () => {
  it("keeps the unplotted bound field on each numeric range bar", () => {
    const option = buildEchartsOption(
      { xColumn: "market" },
      [
        query({
          type: "rangeBar",
          xColumn: "market",
          roles: { start: "low", end: "high" },
          columns: [
            col("market", "SYMBOL"),
            col("low", "INT"),
            col("high", "INT"),
            col("code", "SYMBOL"),
          ],
          dataset: [["London", 5, 10, "LON"]],
        }),
      ],
      { clickColumn: "code" },
    )
    const data = (seriesOf(option)[0].data as unknown[])[0]
    expect(data).toEqual({ value: ["London", 5, 10], columns: { code: "LON" } })
    expect(clickedValue({ data }, "code")).toBe("LON")
  })
  it("retains the raw bound field without changing a candle's OHLC tuple", () => {
    const ts = "2026-01-01T12:00:00.000000Z"
    const option = buildEchartsOption(
      { xColumn: "ts" },
      [
        query({
          type: "candlestick",
          xColumn: "ts",
          yColumns: [],
          columns: [
            col("ts", "TIMESTAMP"),
            col("o", "DOUBLE"),
            col("c", "DOUBLE"),
            col("l", "DOUBLE"),
            col("h", "DOUBLE"),
            col("venue", "SYMBOL"),
          ],
          dataset: [[ts, 10, 12, 9, 13, "London"]],
          ohlc: { open: "o", close: "c", low: "l", high: "h" },
        }),
      ],
      { clickColumn: "venue" },
    )
    expect(seriesOf(option)[0].data).toEqual([
      { value: [ts, 10, 12, 9, 13], columns: { venue: "London" } },
    ])
  })

  it.each(["bar", "pie"] as const)(
    "writes the bound source column for a %s",
    (type) => {
      const bars = query({
        type,
        xColumn: "desk",
        yColumns: ["volume"],
        columns: [
          col("desk", "SYMBOL"),
          col("volume", "INT"),
          col("code", "SYMBOL"),
        ],
        dataset: [
          ["London", 4, "LON"],
          ["Tokyo", 9, "TYO"],
        ],
      })
      const chart = echarts.init(null, undefined, {
        renderer: "svg",
        ssr: true,
        width: 600,
        height: 400,
      })
      try {
        chart.setOption(
          buildEchartsOption({ xColumn: "desk" }, [bars], {
            clickColumn: "code",
          }),
        )
        const model = (
          chart as unknown as {
            getModel(): {
              getSeriesByIndex(index: number): {
                getDataParams(index: number): unknown
              }
            }
          }
        ).getModel()
        const params = model.getSeriesByIndex(0).getDataParams(1)
        const setVariables = vi.fn()
        interactionEvents(
          { click: { variable: "selection", column: "code" } },
          setVariables,
        ).click(params, chart)
        expect(setVariables).toHaveBeenCalledWith({ selection: "'TYO'" })
      } finally {
        chart.dispose()
      }
    },
  )
})

describe("role chart types", () => {
  it("guesses the columns from names, then from kinds", () => {
    // Given
    const band = [
      col("ts", "TIMESTAMP"),
      col("actual", "DOUBLE"),
      col("p95", "DOUBLE"),
      col("p05", "DOUBLE"),
    ]
    const jobs = [
      col("job", "SYMBOL"),
      col("started", "TIMESTAMP"),
      col("finished", "TIMESTAMP"),
    ]
    const quartiles = [
      col("venue", "SYMBOL"),
      ...["max", "p75", "median", "p25", "min"].map((n) => col(n, "DOUBLE")),
    ]

    // When / Then
    expect(guessRoleColumns("band", band, "ts")).toEqual({
      lower: "p05",
      upper: "p95",
    })
    expect(guessRoleColumns("rangeBar", jobs, "job")).toEqual({
      start: "started",
      end: "finished",
    })
    expect(guessRoleColumns("boxplot", quartiles, "venue")).toEqual({
      min: "min",
      q1: "p25",
      median: "median",
      q3: "p75",
      max: "max",
    })
    expect(
      guessRoleColumns(
        "heatmap",
        [col("hour", "INT"), col("day", "SYMBOL"), col("n", "LONG")],
        "hour",
      ),
    ).toEqual({ y: "day", value: "n" })
    expect(
      guessRoleColumns(
        "heatmap",
        [col("hour", "INT"), col("bucket", "INT"), col("n", "LONG")],
        "hour",
      ),
    ).toEqual({ y: "bucket", value: "n" })
  })

  it("offers each type only when the result can draw it", () => {
    // Given / When
    const twoNumbers = availableChartTypes(
      groupColumns([
        col("ts", "TIMESTAMP"),
        col("a", "DOUBLE"),
        col("b", "DOUBLE"),
      ]),
      false,
    )
    const oneNumber = availableChartTypes(
      groupColumns([col("ts", "TIMESTAMP"), col("a", "DOUBLE")]),
      false,
    )

    // Then
    expect(twoNumbers).toEqual(
      expect.arrayContaining(["heatmap", "band", "rangeBar"]),
    )
    expect(twoNumbers).not.toContain("boxplot")
    expect(oneNumber).not.toContain("band")
  })

  it("keeps saved columns while the result has them, else guesses again", () => {
    // Given
    const columns = [
      col("ts", "TIMESTAMP"),
      col("lo", "DOUBLE"),
      col("hi", "DOUBLE"),
    ]

    // When / Then
    expect(
      resolveRoles(
        { type: "band", yColumns: [], band: { lower: "hi", upper: "lo" } },
        columns,
        "ts",
      ),
    ).toEqual({ lower: "hi", upper: "lo" })
    expect(
      resolveRoles(
        { type: "band", yColumns: [], band: { lower: "gone", upper: "lo" } },
        columns,
        "ts",
      ),
    ).toEqual({ lower: "lo", upper: "hi" })
  })

  it("draws a band as a range area with its lines over a time axis", () => {
    // Given
    const option = buildEchartsOption({ xColumn: "ts" }, [
      query({
        type: "band",
        columns: [
          col("ts", "TIMESTAMP"),
          col("actual", "DOUBLE"),
          col("lo", "DOUBLE"),
          col("hi", "DOUBLE"),
        ],
        dataset: [["2026-01-01T00:00:00.000000Z", 5, 4, 6]],
        xColumn: "ts",
        yColumns: ["actual"],
        roles: { lower: "lo", upper: "hi" },
      }),
    ])

    // Then
    const [band, line] = seriesOf(option)
    expect(band).toMatchObject({
      type: "custom",
      renderItem: "areaRange",
      data: [["2026-01-01T00:00:00.000000Z", 4, 6]],
    })
    expect(line).toMatchObject({ type: "line", name: "actual" })
  })

  it("lays range bars down as lanes when start and end are times", () => {
    // Given
    const option = buildEchartsOption({ xColumn: "job" }, [
      query({
        type: "rangeBar",
        columns: [
          col("job", "SYMBOL"),
          col("s", "TIMESTAMP"),
          col("e", "TIMESTAMP"),
        ],
        dataset: [
          [
            "ingest",
            "2026-01-01T00:00:00.000000Z",
            "2026-01-01T02:00:00.000000Z",
          ],
          [
            "backup",
            "2026-01-01T01:00:00.000000Z",
            "2026-01-01T03:00:00.000000Z",
          ],
        ],
        xColumn: "job",
        roles: { start: "s", end: "e" },
      }),
    ])

    // Then
    expect(option.yAxis).toMatchObject({
      type: "category",
      data: ["ingest", "backup"],
    })
    expect(option.xAxis).toMatchObject({ type: "time" })
    expect(seriesOf(option)[0]).toMatchObject({
      renderItem: "barRange",
      encode: { y: 0, x: [1, 2] },
    })
  })

  it("keeps distinct subsecond heatmap coordinates on both axes", () => {
    const a = "2026-01-01T00:00:01.100000Z"
    const b = "2026-01-01T00:00:01.900000Z"
    const option = buildEchartsOption({ xColumn: "x" }, [
      query({
        type: "heatmap",
        xColumn: "x",
        roles: { y: "y", value: "usage" },
        columns: [
          col("x", "TIMESTAMP"),
          col("y", "TIMESTAMP"),
          col("usage", "INT"),
        ],
        dataset: [
          [a, a, 4],
          [b, b, 9],
        ],
      }),
    ])
    expect(seriesOf(option)[0].data).toMatchObject([
      { value: [0, 0, 4] },
      { value: [1, 1, 9] },
    ])
  })

  it("draws SQL null and empty text in separate heatmap cells", () => {
    // Given a missing category and an actual empty VARCHAR
    const option = buildEchartsOption({ xColumn: "label" }, [
      query({
        type: "heatmap",
        xColumn: "label",
        roles: { y: "bucket", value: "usage" },
        columns: [
          col("label", "VARCHAR"),
          col("bucket", "INT"),
          col("usage", "INT"),
        ],
        dataset: [
          [null, 1, 5],
          ["", 1, 9],
        ],
      }),
    ])
    const chart = echarts.init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 800,
      height: 400,
    })
    try {
      // When the chart renders, both coordinates and labels are distinct
      chart.setOption(option)
      expect(seriesOf(option)[0].data).toMatchObject([
        { value: [0, 0, 5] },
        { value: [1, 0, 9] },
      ])
      expect(chart.convertToPixel({ xAxisIndex: 0 }, 0)).not.toBe(
        chart.convertToPixel({ xAxisIndex: 0 }, 1),
      )
      expect(chart.renderToSVGString()).toContain("(null)")
      expect(chart.renderToSVGString()).toContain("(empty)")
    } finally {
      chart.dispose()
    }
  })

  it("orders a numeric heatmap y by value, not as text", () => {
    // Given price levels as y
    const option = buildEchartsOption({ xColumn: "ts" }, [
      query({
        type: "heatmap",
        columns: [col("ts", "STRING"), col("px", "DOUBLE"), col("n", "LONG")],
        dataset: [1.0835, null, 1.084, -2, -1].map((px) => ["a", px, 1]),
        xColumn: "ts",
        roles: { y: "px", value: "n" },
      }),
    ])

    // Then
    const axis = option.yAxis as {
      data: string[]
      axisLabel: { formatter: (key: string) => string }
    }
    expect(axis.data.map(axis.axisLabel.formatter)).toEqual([
      "-2",
      "-1",
      "1.0835",
      "1.084",
      "(null)",
    ])
  })

  it("draws a heatmap of x by y in the result's order for text", () => {
    // Given
    const option = buildEchartsOption({ xColumn: "hour" }, [
      query({
        type: "heatmap",
        columns: [
          col("hour", "INT"),
          col("bucket", "SYMBOL"),
          col("n", "LONG"),
        ],
        dataset: [
          [0, "b10", 1],
          [0, "b2", 2],
          [1, "b10", 3],
        ],
        xColumn: "hour",
        roles: { y: "bucket", value: "n" },
      }),
    ])

    // Then
    const axis = option.yAxis as {
      data: string[]
      axisLabel: { formatter: (key: string) => string }
    }
    expect(axis.data.map(axis.axisLabel.formatter)).toEqual(["b10", "b2"])
    const heatmap = seriesOf(option)[0]
    expect(heatmap.type).toBe("heatmap")
    expect(
      (heatmap.data as { value: unknown[] }[]).map((d) => d.value),
    ).toEqual([
      [0, 0, 1],
      [0, 1, 2],
      [1, 0, 3],
    ])
    // A click can set a variable from any of the row's columns.
    expect(
      clickedValue(
        { data: (heatmap.data as unknown[])[1], name: "0" },
        "bucket",
      ),
    ).toBe("b2")
  })

  it("draws a boxplot from the five columns", () => {
    // Given
    const option = buildEchartsOption({ xColumn: "venue" }, [
      query({
        type: "boxplot",
        columns: [
          col("venue", "SYMBOL"),
          ...["a", "b", "c", "d", "e"].map((n) => col(n, "DOUBLE")),
        ],
        dataset: [["EBS", 1, 2, 3, 4, 5]],
        xColumn: "venue",
        roles: { min: "a", q1: "b", median: "c", q3: "d", max: "e" },
      }),
    ])

    // Then
    expect(seriesOf(option)[0]).toMatchObject({
      type: "boxplot",
      data: [{ value: [1, 2, 3, 4, 5], columns: { venue: "EBS" } }],
    })
  })

  it("labels times as categories by what tells them apart", () => {
    // Given / When / Then
    expect(
      timeCategoryLabels([
        "2026-01-01T09:00:00.000000Z",
        "2026-01-01T10:00:00.000000Z",
      ]),
    ).toEqual(["09:00", "10:00"])
    expect(
      timeCategoryLabels([
        "2026-01-01T00:00:00.000000Z",
        "2026-01-02T00:00:00.000000Z",
      ]),
    ).toEqual(["2026-01-01", "2026-01-02"])
  })

  it("escapes result values in tooltips", () => {
    // Given a lane whose name is markup
    const option = buildEchartsOption({ xColumn: "venue" }, [
      query({
        type: "boxplot",
        columns: [
          col("venue", "SYMBOL"),
          ...["a", "b", "c", "d", "e"].map((n) => col(n, "DOUBLE")),
        ],
        dataset: [["<img src=x>", 1, 2, 3, 4, 5]],
        xColumn: "venue",
        roles: { min: "a", q1: "b", median: "c", q3: "d", max: "e" },
      }),
    ])

    // When
    const formatter = (option.tooltip as { formatter: (p: unknown) => string })
      .formatter
    const html = formatter({
      name: "<img src=x>",
      value: [0, 1, 2, 3, 4, 5],
    })

    // Then
    expect(html).not.toContain("<img")
    expect(html).toContain("&lt;img src=x&gt;")
  })

  it("formats band and range tooltips and the y-axis with the drawn columns", () => {
    // Given
    const formats = { lo: { decimals: 0, suffix: " MW" } }
    const option = buildEchartsOption(
      { xColumn: "ts" },
      [
        query({
          type: "band",
          columns: [
            col("ts", "TIMESTAMP"),
            col("lo", "DOUBLE"),
            col("hi", "DOUBLE"),
          ],
          dataset: [["2026-01-01T00:00:00.000000Z", 4.2, 6.7]],
          xColumn: "ts",
          roles: { lower: "lo", upper: "hi" },
        }),
      ],
      { formats: { ...formats, hi: formats.lo } },
    )

    // Then
    const band = seriesOf(option)[0] as {
      tooltip: { valueFormatter: (v: unknown) => string }
    }
    expect(band.tooltip.valueFormatter(4.2)).toBe("4 MW")
    const y = (
      Array.isArray(option.yAxis) ? option.yAxis[0] : option.yAxis
    ) as {
      axisLabel: { formatter: (v: number) => string }
    }
    expect(y.axisLabel.formatter(4.2)).toBe("4")
  })

  it("orders a numeric heatmap x and keeps the row for clicks", () => {
    // Given hours that come back unordered
    const option = buildEchartsOption({ xColumn: "hour" }, [
      query({
        type: "heatmap",
        columns: [col("hour", "INT"), col("day", "SYMBOL"), col("n", "LONG")],
        dataset: [
          [10, "Mon", 1],
          [2, "Mon", 2],
        ],
        xColumn: "hour",
        roles: { y: "day", value: "n" },
      }),
    ])

    // Then
    const axis = option.xAxis as {
      data: string[]
      axisLabel: { formatter: (key: string) => string }
    }
    expect(axis.data.map(axis.axisLabel.formatter)).toEqual(["2", "10"])
  })

  it("puts events on a timeline", () => {
    // Given a Gantt and a deploy marker
    const build = () =>
      buildEchartsOption(
        {
          xColumn: "job",
          events: [
            {
              index: 1,
              columns: [col("at", "TIMESTAMP"), col("what", "STRING")],
              dataset: [["2026-01-01T01:00:00.000000Z", "deploy"]],
              columnsRole: {},
            },
          ],
        },
        [
          query({
            type: "rangeBar",
            columns: [
              col("job", "SYMBOL"),
              col("s", "TIMESTAMP"),
              col("e", "TIMESTAMP"),
            ],
            dataset: [
              [
                "ingest",
                "2026-01-01T00:00:00.000000Z",
                "2026-01-01T02:00:00.000000Z",
              ],
            ],
            xColumn: "job",
            roles: { start: "s", end: "e" },
          }),
        ],
      )

    // When the renderer measures it and adds its zoom
    const option = build()
    const zoomed = withZoomDensity(option, chartZoomDensity(option, 900))

    // Then the markers draw, and linked charts can follow the pointer and zoom
    expect(seriesOf(option).map((s) => s.name)).toEqual(["job", "Events"])
    expect(option.xAxis).toMatchObject({ axisPointer: { show: true } })
    // The timeline keeps its own zoom, armed even with few bars
    expect((zoomed.dataZoom as unknown[])[0]).toMatchObject({
      type: "inside",
      filterMode: "weakFilter",
      disabled: false,
    })
  })

  it("labels a span with its ends and its length", () => {
    // Given / When / Then
    expect(
      spanLabel("2026-01-01T09:00:00.000000Z", "2026-01-01T10:30:00.000000Z"),
    ).toMatch(/^09:00 → 10:30 · /)
  })

  it("draws the band from the first row in view after a zoom", () => {
    // Given 1000 rows zoomed to the last 10: ECharts passes the raw index
    // as dataIndex and the index among the rows in view as dataIndexInside
    const values = (dim: number, i: number) => [i, i, i + 2][dim]
    const api = {
      value: values,
      coord: ([x, y]: number[]) => [x * 10, y],
      visual: () => "teal",
    }
    const params = {
      dataIndex: 999,
      dataIndexInside: 9,
      dataInsideLength: 10,
      encode: { x: [0], y: [1, 2] },
      itemPayload: { opacity: 0.2 },
    }

    // When
    const drawn = (
      areaRangeRenderItem as unknown as (
        p: unknown,
        a: unknown,
      ) => { children: { shape: { points: number[][] } }[] }
    )(params, api)

    // Then one polygon with 10 lows and 10 highs
    expect(drawn.children).toHaveLength(1)
    expect(drawn.children[0].shape.points).toHaveLength(20)
  })

  it("gives each Band row its own non-silent footprint inside the fill", () => {
    const api = {
      value: (dim: number, i: number) => [i * 10, 2, 8][dim],
      coord: ([x, y]: number[]) => [x, y],
      visual: () => "teal",
    }
    const draw = (i: number, clickEnabled: boolean) =>
      (
        areaRangeRenderItem as unknown as (
          p: unknown,
          a: unknown,
        ) => {
          children: { silent?: boolean; shape: { points: number[][] } }[]
        }
      )(
        {
          dataIndexInside: i,
          dataInsideLength: 2,
          encode: { x: [0], y: [1, 2] },
          itemPayload: { clickEnabled },
        },
        api,
      ).children
    const hits = [draw(0, true), draw(1, true)].map((shapes) =>
      shapes.filter((shape) => !shape.silent),
    )
    expect(hits.map((points) => points.length)).toEqual([1, 1])
    expect(
      hits.map(([shape]) => [
        Math.min(...shape.shape.points.map(([x]) => x)),
        Math.max(...shape.shape.points.map(([x]) => x)),
      ]),
    ).toEqual([
      [0, 5],
      [5, 10],
    ])
    expect(draw(0, false)).toEqual([])
    expect(draw(1, false).map((shape) => shape.silent)).toEqual([true])
  })

  it("sizes range bars on a time axis by the plot's length", () => {
    // Given 4 bars on a 400 px wide time axis (no category band)
    const params = {
      encode: { x: [0], y: [1, 2] },
      itemPayload: { barWidth: "50%" },
      coordSys: { width: 400, height: 200 },
      dataInsideLength: 4,
    }
    const api = {
      value: (dim: number) => [100, 1, 3][dim],
      coord: ([x, y]: number[]) => [x, y * 10],
      size: () => [0, 0],
      visual: () => "teal",
    }

    // When
    const drawn = (
      barRangeRenderItem as unknown as (
        p: unknown,
        a: unknown,
      ) => { shape: { width: number } }
    )(params, api)

    // Then each bar takes half of its 100 px share
    expect(drawn.shape.width).toBe(50)
  })

  it("reports statements a chart that draws alone leaves out", () => {
    // Given a heatmap and a line over the same x
    const columns = [
      col("ts", "TIMESTAMP"),
      col("day", "SYMBOL"),
      col("n", "LONG"),
    ]
    const result = (q: string) => ({
      query: q,
      columns,
      dataset: [["2026-01-01T00:00:00.000000Z", "Mon", 2]],
      count: 1,
      timestamp: -1,
    })
    const config = {
      xColumn: "ts",
      queries: [
        { type: "heatmap" as const, yColumns: [] },
        { type: "line" as const, yColumns: ["n"] },
      ],
    }
    const resolution = resolveDraw(
      ["a", "b"],
      [result("a"), result("b")] as never,
      config,
    )

    // When
    const problems = drawProblems(resolution, config)

    // Then
    expect(problems).toHaveLength(1)
    expect(problems[0].severity).toBe("warning")
    expect(problems[0].message).toMatch(/left out: the heatmap chart/)
  })

  it("reports a pie next to other queries as shown only alone", () => {
    // Given a pie and a line over the same x
    const columns = [col("ts", "TIMESTAMP"), col("n", "LONG")]
    const result = (q: string) => ({
      query: q,
      columns,
      dataset: [["2026-01-01T00:00:00.000000Z", 2]],
      count: 1,
      timestamp: -1,
    })
    const config = {
      xColumn: "ts",
      queries: [
        { type: "pie" as const, yColumns: ["n"] },
        { type: "line" as const, yColumns: ["n"] },
      ],
    }

    // When
    const problems = drawProblems(
      resolveDraw(["a", "b"], [result("a"), result("b")] as never, config),
      config,
    )

    // Then
    expect(problems.map((p) => p.message)).toEqual([
      "Q1 was left out: a pie chart only shows as the only query.",
    ])
  })

  it("reports role columns the result no longer has, but not for disabled queries", () => {
    // Given a band whose saved edges were renamed
    const columns = [
      col("ts", "TIMESTAMP"),
      col("low", "DOUBLE"),
      col("high", "DOUBLE"),
    ]
    const result = {
      query: "a",
      columns,
      dataset: [["2026-01-01T00:00:00.000000Z", 1, 2]],
      count: 1,
      timestamp: -1,
    }
    const band = {
      type: "band" as const,
      yColumns: [],
      band: { lower: "lo", upper: "hi" },
    }

    // When
    const live = drawProblems(
      resolveDraw(["a"], [result] as never, { xColumn: "ts", queries: [band] }),
      { xColumn: "ts", queries: [band] },
    )
    const disabled = drawProblems(
      resolveDraw(["a"], [result] as never, {
        xColumn: "ts",
        queries: [{ ...band, enabled: false }],
      }),
      { xColumn: "ts", queries: [{ ...band, enabled: false }] },
    )

    // Then
    expect(live.map((p) => p.message)).toEqual([
      expect.stringMatching(
        /"lo", "hi" not in the result; drew lower=low, upper=high instead/,
      ) as string,
    ])
    expect(disabled).toEqual([])
  })
})
