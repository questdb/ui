import { describe, it, expect } from "vitest"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import {
  buildEchartsOption,
  type ChartGlobals,
  type ResolvedQuery,
} from "./buildEchartsOption"

const col = (name: string, type: string): ColumnDefinition => ({ name, type })

const resolved = (over: Partial<ResolvedQuery>): ResolvedQuery => ({
  index: 0,
  columns: [],
  dataset: [],
  xColumn: null,
  type: "line",
  yColumns: [],
  axis: "left",
  ...over,
})

// Narrow the loose echarts option types for assertions.
const firstAxis = (axis: unknown): Record<string, unknown> =>
  (Array.isArray(axis) ? axis[0] : axis) as Record<string, unknown>
const seriesList = (s: unknown): Record<string, unknown>[] =>
  (Array.isArray(s) ? s : [s]) as Record<string, unknown>[]

describe("buildEchartsOption — order-book depth (numeric value x-axis + step)", () => {
  const depthColumns = [
    col("price", "DOUBLE"),
    col("cum_bid", "DOUBLE"),
    col("cum_ask", "DOUBLE"),
  ]
  const depthDataset: (number | null)[][] = [
    [100, 5, null],
    [101, 3, null],
    [102, null, 4],
    [103, null, 7],
  ]
  const chart: ChartGlobals = { xColumn: "price" }

  it("renders a continuous value x-axis (not a category axis) for numeric x", () => {
    const opt = buildEchartsOption(chart, [
      resolved({
        columns: depthColumns,
        dataset: depthDataset,
        xColumn: "price",
        type: "stepArea",
        yColumns: ["cum_bid", "cum_ask"],
      }),
    ])
    const x = firstAxis(opt.xAxis)
    expect(x.type).toBe("value")
    expect(x.name).toBe("price")
    // A category axis would carry a `data` array of price labels; a value axis must not.
    expect(x.data).toBeUndefined()
  })

  it("stepArea emits stepped, area-filled line series with [x,y] numeric pairs", () => {
    const opt = buildEchartsOption(chart, [
      resolved({
        columns: depthColumns,
        dataset: depthDataset,
        xColumn: "price",
        type: "stepArea",
        yColumns: ["cum_bid", "cum_ask"],
      }),
    ])
    const series = seriesList(opt.series)
    expect(series).toHaveLength(2)
    for (const s of series) {
      expect(s.type).toBe("line")
      expect(s.step).toBe("end")
      expect(s.areaStyle).toBeDefined()
      expect(s.smooth).toBeUndefined() // stepped curves must not smooth
    }
    // x is carried positionally as [price, value] pairs along the value axis.
    expect(series[0].data).toEqual([
      [100, 5],
      [101, 3],
      [102, null],
      [103, null],
    ])
  })

  it("stepLine is stepped but NOT area-filled", () => {
    const opt = buildEchartsOption(chart, [
      resolved({
        columns: depthColumns,
        dataset: depthDataset,
        xColumn: "price",
        type: "stepLine",
        yColumns: ["cum_bid"],
      }),
    ])
    const s = seriesList(opt.series)[0]
    expect(s.type).toBe("line")
    expect(s.step).toBe("end")
    expect(s.areaStyle).toBeUndefined()
  })

  it("plain line over a numeric x also gets a value axis (was a category axis)", () => {
    const opt = buildEchartsOption(chart, [
      resolved({
        columns: depthColumns,
        dataset: depthDataset,
        xColumn: "price",
        type: "line",
        yColumns: ["cum_bid"],
      }),
    ])
    expect(firstAxis(opt.xAxis).type).toBe("value")
    expect(seriesList(opt.series)[0].step).toBeUndefined()
  })
})

describe("buildEchartsOption — volume bars overlaid on candlesticks", () => {
  const columns = [
    col("ts", "TIMESTAMP"),
    col("open", "DOUBLE"),
    col("high", "DOUBLE"),
    col("low", "DOUBLE"),
    col("close", "DOUBLE"),
    col("volume", "DOUBLE"),
  ]
  const dataset: number[][] = [
    [1000, 10, 12, 9, 11, 500],
    [2000, 11, 13, 10, 12, 700],
  ]

  it("makes the volume bars translucent and lifts candlesticks above them", () => {
    const opt = buildEchartsOption({ xColumn: "ts" }, [
      resolved({
        columns,
        dataset,
        xColumn: "ts",
        type: "candlestick",
        ohlc: { open: "open", high: "high", low: "low", close: "close" },
      }),
      resolved({
        index: 1,
        columns,
        dataset,
        xColumn: "ts",
        type: "bar",
        yColumns: ["volume"],
        axis: "right",
      }),
    ])
    const series = seriesList(opt.series)
    const bar = series.find((s) => s.type === "bar")
    const candle = series.find((s) => s.type === "candlestick")
    expect((bar?.itemStyle as { opacity?: number })?.opacity).toBeLessThan(1)
    expect(candle?.z).toBe(3) // candles render above the translucent bars
  })

  it("draws grid lines on the right axis when every series is on it", () => {
    // Given an RSI line put on the right axis for its 0..100 bounds
    const rsiOnRight = resolved({
      columns,
      dataset,
      xColumn: "ts",
      type: "line",
      yColumns: ["close"],
      axis: "right",
    })

    // When
    const opt = buildEchartsOption(
      { xColumn: "ts", rightAxis: { name: "RSI", min: 0, max: 100 } },
      [rsiOnRight],
    )

    // Then
    const [left, right] = opt.yAxis as Array<{
      show?: boolean
      splitLine?: { show?: boolean }
    }>
    expect(left.show).toBe(false)
    expect(right.splitLine?.show).toBe(true)
  })

  it("keeps grid lines on the left axis when it has series", () => {
    // When
    const opt = buildEchartsOption({ xColumn: "ts" }, [
      resolved({
        columns,
        dataset,
        xColumn: "ts",
        type: "line",
        yColumns: ["close"],
      }),
      resolved({
        index: 1,
        columns,
        dataset,
        xColumn: "ts",
        type: "bar",
        yColumns: ["volume"],
        axis: "right",
      }),
    ])

    // Then
    const [left, right] = opt.yAxis as Array<{
      show?: boolean
      splitLine?: { show?: boolean }
    }>
    expect(left.show).toBe(true)
    expect(right.splitLine?.show).toBe(false)
  })

  it("leaves a pure bar chart fully opaque (no overlay)", () => {
    const opt = buildEchartsOption({ xColumn: "ts" }, [
      resolved({
        columns,
        dataset,
        xColumn: "ts",
        type: "bar",
        yColumns: ["volume"],
      }),
    ])
    const bar = seriesList(opt.series).find((s) => s.type === "bar")
    expect(bar?.itemStyle).toBeUndefined()
  })

  it("emits an empty candle ('-') when any OHLC component is null", () => {
    const ohlcColumns = [
      col("ts", "TIMESTAMP"),
      col("open", "DOUBLE"),
      col("high", "DOUBLE"),
      col("low", "DOUBLE"),
      col("close", "DOUBLE"),
    ]
    const opt = buildEchartsOption({ xColumn: "ts" }, [
      resolved({
        columns: ohlcColumns,
        dataset: [
          [1000, 10, 12, 9, 11],
          [2000, null, null, null, null],
        ],
        xColumn: "ts",
        type: "candlestick",
        ohlc: { open: "open", high: "high", low: "low", close: "close" },
      }),
    ])
    const candle = seriesList(opt.series).find((s) => s.type === "candlestick")
    // [ts, open, close, low, high]; the empty bucket must stay a gap, not [0,0,0,0].
    expect(candle?.data).toEqual([
      [1000, 10, 11, 9, 12],
      [2000, "-", "-", "-", "-"],
    ])
  })
})

describe("buildEchartsOption — scatter keeps nulls as gaps (no fabricated zeros)", () => {
  it("emits null for a missing x or y instead of plotting a point at 0", () => {
    const opt = buildEchartsOption({ xColumn: "a" }, [
      resolved({
        columns: [col("a", "DOUBLE"), col("b", "DOUBLE")],
        dataset: [
          [1, 100],
          [2, null],
          [null, 300],
        ],
        xColumn: "a",
        type: "scatter",
        yColumns: ["b"],
      }),
    ])
    const s = seriesList(opt.series)[0]
    expect(s.type).toBe("scatter")
    // A null measurement must be a gap, not a real point pinned to 0.
    expect(s.data).toEqual([
      [1, 100],
      [2, null],
      [null, 300],
    ])
  })
})

describe("buildEchartsOption — categorical x preserves duplicate rows", () => {
  const columns = [col("side", "SYMBOL"), col("qty", "LONG")]
  // Non-aggregated rows: "buy" and "sell" each appear twice.
  const dataset: (string | number)[][] = [
    ["buy", 10],
    ["sell", 5],
    ["buy", 20],
    ["sell", 7],
  ]

  it("renders one axis slot and one value per row (no last-write-wins collapse)", () => {
    const opt = buildEchartsOption({ xColumn: "side" }, [
      resolved({
        columns,
        dataset,
        xColumn: "side",
        type: "bar",
        yColumns: ["qty"],
      }),
    ])
    const x = firstAxis(opt.xAxis)
    expect(x.type).toBe("category")
    // All four rows survive — duplicates are kept, not deduped into a Set.
    expect(x.data).toEqual(["buy", "sell", "buy", "sell"])
    expect(seriesList(opt.series)[0].data).toEqual([10, 5, 20, 7])
  })

  it("still dedupes onto a shared category union when overlaying multiple queries", () => {
    const opt = buildEchartsOption({ xColumn: "side" }, [
      resolved({
        columns,
        dataset: [
          ["buy", 10],
          ["sell", 5],
        ],
        xColumn: "side",
        type: "bar",
        yColumns: ["qty"],
      }),
      resolved({
        index: 1,
        columns: [col("side", "SYMBOL"), col("price", "DOUBLE")],
        dataset: [
          ["sell", 200],
          ["buy", 100],
        ],
        xColumn: "side",
        type: "line",
        yColumns: ["price"],
      }),
    ])
    const x = firstAxis(opt.xAxis)
    // Two queries share one axis: union is deduped and each series aligns to it.
    expect(x.data).toEqual(["buy", "sell"])
    const series = seriesList(opt.series)
    expect(series[0].data).toEqual([10, 5])
    expect(series[1].data).toEqual([100, 200])
  })
})

describe("buildEchartsOption — partitioned categorical x aligns to the shared union", () => {
  const columns = [
    col("region", "SYMBOL"),
    col("grp", "SYMBOL"),
    col("qty", "LONG"),
  ]
  // Partition "A" has both regions (north twice → last-write-wins);
  // partition "B" only has north → south must align to null, not shift.
  const dataset: (string | number)[][] = [
    ["north", "A", 10],
    ["south", "A", 20],
    ["north", "B", 30],
    ["north", "A", 99],
  ]

  it("pivots partitions to series and aligns each to the category union (last row wins, missing → null)", () => {
    const opt = buildEchartsOption({ xColumn: "region" }, [
      resolved({
        columns,
        dataset,
        xColumn: "region",
        partitionByColumn: "grp",
        type: "bar",
        yColumns: ["qty"],
      }),
    ])
    const x = firstAxis(opt.xAxis)
    expect(x.type).toBe("category")
    expect(x.data).toEqual(["north", "south"])
    const series = seriesList(opt.series)
    const a = series.find((s) => s.name === "A")
    const b = series.find((s) => s.name === "B")
    // A: north keeps the last row (99, not 10); south present (20).
    expect(a?.data).toEqual([99, 20])
    // B: north present (30); south absent → aligned to null, not collapsed.
    expect(b?.data).toEqual([30, null])
  })
})

describe("buildEchartsOption — step over a temporal x", () => {
  it("keeps a time axis and applies the step to the line series", () => {
    const columns = [col("ts", "TIMESTAMP"), col("state", "DOUBLE")]
    const dataset: (number | null)[][] = [
      [1000, 0],
      [2000, 1],
      [3000, 0],
    ]
    const opt = buildEchartsOption({ xColumn: "ts" }, [
      resolved({
        columns,
        dataset,
        xColumn: "ts",
        type: "stepLine",
        yColumns: ["state"],
      }),
    ])
    expect(firstAxis(opt.xAxis).type).toBe("time")
    const s = seriesList(opt.series)[0]
    expect(s.type).toBe("line")
    expect(s.step).toBe("end")
    expect(s.data).toEqual([
      [1000, 0],
      [2000, 1],
      [3000, 0],
    ])
  })
})

describe("buildEchartsOption — timestamps render in UTC, like the result grid", () => {
  it("marks a temporal x-axis as UTC so labels and tooltips match the grid", () => {
    // Given a designated timestamp plotted against a numeric column
    const columns = [col("ts", "TIMESTAMP"), col("price", "DOUBLE")]
    const dataset: (number | null)[][] = [
      [1704067200000, 42],
      [1704153600000, 43],
    ]

    // When the chart option is built
    const opt = buildEchartsOption({ xColumn: "ts" }, [
      resolved({ columns, dataset, xColumn: "ts", yColumns: ["price"] }),
    ])

    // Then echarts is told to format in UTC rather than the browser's timezone
    expect(firstAxis(opt.xAxis).type).toBe("time")
    expect(opt.useUTC).toBe(true)
  })
})

describe("buildEchartsOption — axis labels", () => {
  it("hides overlapping x-axis labels so a narrow chart thins them instead of colliding", () => {
    // Given a temporal x column with more ticks than a narrow chart can fit
    const columns = [col("ts", "TIMESTAMP"), col("v", "DOUBLE")]
    const dataset = Array.from({ length: 15 }, (_, i) => [i * 120_000, i])
    // When the option builds
    const opt = buildEchartsOption({ xColumn: "ts" }, [
      resolved({
        columns,
        dataset,
        xColumn: "ts",
        type: "bar",
        yColumns: ["v"],
      }),
    ])
    // Then the x-axis label config asks ECharts to hide overlaps
    expect(firstAxis(opt.xAxis).axisLabel).toMatchObject({ hideOverlap: true })
  })
})

describe("buildEchartsOption — right-axis bounds", () => {
  it("keeps unset bounds as explicit keys so a cleared bound resets the merged chart", () => {
    // Given a chart with a right axis whose min/max were cleared
    const columns = [
      col("ts", "TIMESTAMP"),
      col("a", "DOUBLE"),
      col("b", "DOUBLE"),
    ]
    const dataset = [[1000, 1, 100]]
    // When the option builds
    const opt = buildEchartsOption({ xColumn: "ts", rightAxis: {} }, [
      resolved({ columns, dataset, xColumn: "ts", yColumns: ["a"] }),
      resolved({
        index: 1,
        columns,
        dataset,
        xColumn: "ts",
        yColumns: ["b"],
        axis: "right",
      }),
    ])
    // Then both bound keys are present, so ECharts' merge overwrites stale bounds
    const rightAxis = (opt.yAxis as Record<string, unknown>[])[1]
    expect(rightAxis).toHaveProperty("min", undefined)
    expect(rightAxis).toHaveProperty("max", undefined)
  })
})

describe("buildEchartsOption — reference lines", () => {
  const columns = [
    col("ts", "TIMESTAMP"),
    col("price", "DOUBLE"),
    col("rsi", "DOUBLE"),
  ]
  const dataset = [
    ["2026-11-01T00:00:00.000000Z", 100, 40],
    ["2026-11-02T00:00:00.000000Z", 104, 55],
  ]
  const price = resolved({
    columns,
    dataset,
    xColumn: "ts",
    yColumns: ["price"],
  })
  const rsi = resolved({
    index: 1,
    columns,
    dataset,
    xColumn: "ts",
    yColumns: ["rsi"],
    axis: "right",
  })
  type MarkLine = { data: { yAxis: number; label: { formatter: string } }[] }
  const markLineOf = (opt: ReturnType<typeof buildEchartsOption>, i: number) =>
    seriesList(opt.series)[i].markLine as MarkLine | undefined

  it("draws each line on a series of its own axis, labelled", () => {
    // When
    const opt = buildEchartsOption(
      {
        xColumn: "ts",
        referenceLines: [
          { value: 30, axis: "right", label: "Oversold" },
          { value: 70, axis: "right" },
        ],
      },
      [price, rsi],
    )

    // Then
    expect(markLineOf(opt, 0)).toBeUndefined()
    expect(markLineOf(opt, 1)).toBeUndefined()
    expect(seriesList(opt.series)[2]).toMatchObject({ yAxisIndex: 1 })
    expect(markLineOf(opt, 2)?.data).toEqual([
      { yAxis: 30, label: { formatter: "Oversold" } },
      { yAxis: 70, label: { formatter: "70" } },
    ])
  })

  it("hides a right threshold without changing the left scale, then restores it", () => {
    const chart = {
      xColumn: "ts",
      referenceLines: [
        { axis: "right" as const, value: 70, label: "RSI threshold" },
      ],
    }
    for (const queries of [[price, rsi], [price], [price, rsi]]) {
      const option = buildEchartsOption(chart, queries)
      if (queries.length === 1) {
        expect(seriesList(option.series)).toHaveLength(1)
        expect(firstAxis(option.yAxis)).toMatchObject({
          min: undefined,
          max: undefined,
        })
      } else {
        expect(seriesList(option.series)[2]).toMatchObject({ yAxisIndex: 1 })
        expect(markLineOf(option, 2)?.data[0].label.formatter).toBe(
          "RSI threshold",
        )
      }
    }
  })

  it("puts an implicit left line on the right in a right-only chart", () => {
    // When
    const opt = buildEchartsOption(
      { xColumn: "ts", referenceLines: [{ value: 70 }] },
      [{ ...rsi, index: 0 }],
    )

    // Then
    expect(seriesList(opt.series)[1]).toMatchObject({ yAxisIndex: 1 })
    expect(markLineOf(opt, 1)?.data[0].yAxis).toBe(70)
  })

  it("hides a left line while the configured left query plots nothing", () => {
    // When
    const opt = buildEchartsOption(
      {
        xColumn: "ts",
        referenceLines: [{ value: 150 }],
        leftAxisConfigured: true,
      },
      [rsi],
    )

    // Then
    expect(seriesList(opt.series)).toHaveLength(1)
    expect(
      (opt.yAxis as { max?: unknown }[]).every((axis) => axis.max == null),
    ).toBe(true)
  })

  it("grows a self-scaling axis to keep its lines in view, and leaves it be otherwise", () => {
    // When
    const opt = buildEchartsOption(
      { xColumn: "ts", referenceLines: [{ value: 120 }, { value: 90 }] },
      [price],
    )

    // Then
    const axis = firstAxis(opt.yAxis) as {
      min: (v: { min: number; max: number }) => number | null
      max: (v: { min: number; max: number }) => number | null
    }
    expect(axis.max({ min: 100, max: 104 })).toBe(120)
    expect(axis.min({ min: 100, max: 104 })).toBe(90)
    expect(axis.max({ min: 100, max: 130 })).toBeNull()
  })
})

describe("buildEchartsOption — heatmap", () => {
  const columns = [
    col("ts", "TIMESTAMP"),
    col("symbol", "SYMBOL"),
    col("spread", "DOUBLE"),
  ]
  const dataset = [
    ["2026-11-01T00:00:00.000000Z", "EURUSD", 1.5],
    ["2026-11-01T00:00:00.000000Z", "BTCUSD", 8],
    ["2026-11-01T01:00:00.000000Z", "EURUSD", null],
  ]

  it("lays the x column out along the bottom, a row per partition value, colored by the value", () => {
    // When
    const opt = buildEchartsOption({ xColumn: "ts" }, [
      resolved({
        columns,
        dataset,
        xColumn: "ts",
        type: "heatmap",
        yColumns: ["spread"],
        partitionByColumn: "symbol",
      }),
    ])

    // Then
    const xAxis = firstAxis(opt.xAxis) as {
      data: string[]
      axisLabel: { formatter: (v: string) => string }
    }
    expect(xAxis.data).toHaveLength(2)
    // One day's hours show their time alone.
    expect(xAxis.axisLabel.formatter(xAxis.data[1])).toBe("01:00")
    expect(xAxis.axisLabel.formatter("2026-11-01T01:00:34.000000Z")).toBe(
      "01:00:34",
    )
    expect(firstAxis(opt.yAxis).data).toEqual(["BTCUSD", "EURUSD"])
    expect(seriesList(opt.series)[0]).toMatchObject({
      type: "custom",
      data: [
        [0, 1, 1.5, 1.5],
        [0, 0, 8, 8],
        [1, 1, "-", "-"],
      ],
    })
    expect(opt.visualMap).toMatchObject({ min: 1.5, max: 8, dimension: 2 })
  })

  it("identifies distinct sub-second slots in the hover tooltip", () => {
    const timestamps = [
      "2026-11-01T00:00:00.001000Z",
      "2026-11-01T00:00:00.002000Z",
    ]
    const opt = buildEchartsOption({ xColumn: "ts" }, [
      resolved({
        columns,
        dataset: timestamps.map((ts) => [ts, "EURUSD", 1]),
        xColumn: "ts",
        type: "heatmap",
        yColumns: ["spread"],
        partitionByColumn: "symbol",
      }),
    ])
    const tooltip = opt.tooltip as { formatter: (p: unknown) => string }
    for (const [slot, timestamp] of timestamps.entries()) {
      expect(tooltip.formatter({ value: [slot, 0, 1, 1] })).toContain(timestamp)
    }
  })

  it.each(["row", "chart"] as const)(
    "colors adjacent large LONGs distinctly and keeps exact tooltip text (%s)",
    (colorScale) => {
      const readings = [
        "9007199254740991",
        "9007199254740992",
        "9007199254740993",
      ]
      const opt = buildEchartsOption({ xColumn: "ts" }, [
        resolved({
          columns: [columns[0], columns[1], col("spread", "LONG")],
          dataset: readings.map((reading, i) => [
            `2026-11-01T0${i}:00:00.000000Z`,
            "EURUSD",
            reading,
          ]),
          xColumn: "ts",
          type: "heatmap",
          yColumns: ["spread"],
          partitionByColumn: "symbol",
          colorScale,
        }),
      ])
      const data = seriesList(opt.series)[0].data as unknown[][]
      expect(data.map((point) => point[2])).toEqual([0, 0.5, 1])
      expect(opt.visualMap).toMatchObject({
        min: 0,
        max: 1,
        text:
          colorScale === "row"
            ? ["Row high", "Row low"]
            : [readings[2], readings[0]],
      })
      const tooltip = opt.tooltip as { formatter: (p: unknown) => string }
      data.forEach((point, i) => {
        expect(tooltip.formatter({ value: point })).toContain(
          `<b>${readings[i]}</b>`,
        )
      })
    },
  )

  it.each([
    [1.2342, ["1.2342", "1.2341"]],
    [1.2351, ["1.2351", "1.2341"]],
  ] as const)(
    "distinguishes the legend bounds with a maximum of %s",
    (max, text) => {
      const min = 1.2341
      const opt = buildEchartsOption({ xColumn: "ts" }, [
        resolved({
          columns,
          dataset: [
            [1000, "EURUSD", min],
            [2000, "EURUSD", max],
          ],
          xColumn: "ts",
          type: "heatmap",
          yColumns: ["spread"],
          partitionByColumn: "symbol",
        }),
      ])
      expect(opt.visualMap).toMatchObject({ min, max, text })
    },
  )

  it("escapes the values it shows in its tooltip", () => {
    // Given
    const opt = buildEchartsOption({ xColumn: "ts" }, [
      resolved({
        columns,
        dataset: [["2026-11-01T00:00:00.000000Z", "<img src=x>", 1]],
        xColumn: "ts",
        type: "heatmap",
        yColumns: ["spread"],
        partitionByColumn: "symbol",
      }),
    ])

    // When
    const tooltip = opt.tooltip as { formatter: (p: unknown) => string }
    const html = tooltip.formatter({ value: [0, 0, 1, 1] })

    // Then
    expect(html).toContain("&lt;img src=x&gt;")
    expect(html).not.toContain("<img")
  })
})

describe("buildEchartsOption — heatmap color scale per row", () => {
  const columns = [
    col("ts", "TIMESTAMP"),
    col("asset", "SYMBOL"),
    col("volume", "DOUBLE"),
  ]
  // BTC trades thousands of times the volume of ADA.
  const dataset = [
    ["2026-11-01T00:00:00.000000Z", "BTC", 5000],
    ["2026-11-01T00:00:05.000000Z", "BTC", 9000],
    ["2026-11-01T00:00:00.000000Z", "ADA", 2],
    ["2026-11-01T00:00:05.000000Z", "ADA", 4],
  ]
  const heatmap = (colorScale?: "row") =>
    buildEchartsOption({ xColumn: "ts" }, [
      resolved({
        columns,
        dataset,
        xColumn: "ts",
        type: "heatmap",
        yColumns: ["volume"],
        partitionByColumn: "asset",
        colorScale,
      }),
    ])

  it("colors each cell by where it falls in its own row, and shows its own value", () => {
    // When
    const opt = heatmap("row")

    // Then
    expect(seriesList(opt.series)[0].data).toEqual([
      [0, 1, 0, 5000],
      [1, 1, 1, 9000],
      [0, 0, 0, 2],
      [1, 0, 1, 4],
    ])
    expect(opt.visualMap).toMatchObject({ min: 0, max: 1 })
    const tooltip = opt.tooltip as { formatter: (p: unknown) => string }
    expect(tooltip.formatter({ value: [1, 0, 1, 4] })).toContain("<b>4</b>")
  })

  it("runs time in order along x when the query sorts by row first", () => {
    // Given rows sorted by asset, then time
    const sortedByAsset = [
      ["2026-11-01T00:00:05.000000Z", "ADA", 1],
      ["2026-11-01T00:00:00.000000Z", "BTC", 2],
      ["2026-11-01T00:00:05.000000Z", "BTC", 3],
    ]

    // When
    const opt = buildEchartsOption({ xColumn: "ts" }, [
      resolved({
        columns,
        dataset: sortedByAsset,
        xColumn: "ts",
        type: "heatmap",
        yColumns: ["volume"],
        partitionByColumn: "asset",
      }),
    ])

    // Then
    expect(firstAxis(opt.xAxis).data).toEqual([
      "2026-11-01T00:00:00.000000Z",
      "2026-11-01T00:00:05.000000Z",
    ])
    expect(seriesList(opt.series)[0].data).toEqual([
      [1, 0, 1, 1],
      [0, 1, 2, 2],
      [1, 1, 3, 3],
    ])
  })

  it("puts its rows top-down in order", () => {
    // When
    const opt = heatmap()

    // Then
    expect(firstAxis(opt.yAxis)).toMatchObject({
      data: ["ADA", "BTC"],
      inverse: true,
    })
    expect(opt.visualMap).toMatchObject({ min: 2, max: 9000 })
  })
})

it.each(["chart", "row"] as const)(
  "uses exact DECIMAL X order and normalizes exact DECIMAL differences (%s)",
  (colorScale) => {
    const readings = [
      "1234.123456789012345678",
      "1234.123456789012345679",
      "1234.123456789012345680",
    ]
    const opt = buildEchartsOption({ xColumn: "slot" }, [
      resolved({
        type: "heatmap",
        xColumn: "slot",
        partitionByColumn: "site",
        yColumns: ["reading"],
        columns: [
          col("slot", "DECIMAL(38,18)"),
          col("site", "SYMBOL"),
          col("reading", "DECIMAL(38,18)"),
        ],
        dataset: [2, 0, 1].map((i) => [readings[i], "west", readings[i]]),
        colorScale,
      }),
    ])
    expect(firstAxis(opt.xAxis).data).toEqual(readings)
    const data = seriesList(opt.series)[0].data as unknown[][]
    expect(data).toEqual([
      [2, 0, 1, readings[2]],
      [0, 0, 0, readings[0]],
      [1, 0, 0.5, readings[1]],
    ])
    expect(opt.visualMap).toMatchObject({
      min: 0,
      max: 1,
      text:
        colorScale === "row"
          ? ["Row high", "Row low"]
          : [readings[2], readings[0]],
    })
    const tooltip = opt.tooltip as { formatter: (p: unknown) => string }
    const scale =
      colorScale === "row" ? "" : `<br/>Scale: ${readings[0]} to ${readings[2]}`
    expect(tooltip.formatter({ value: data[0] })).toBe(
      `${readings[2]}<br/>west: <b>${readings[2]}</b>${scale}`,
    )
  },
)

it("keeps null and empty heatmap rows separate from each other and literal labels", () => {
  const categories = [null, "", "[NULL]", "[empty]", "[NULL] (2)"]
  const opt = buildEchartsOption({ xColumn: "slot" }, [
    resolved({
      type: "heatmap",
      xColumn: "slot",
      partitionByColumn: "site",
      yColumns: ["reading"],
      columns: [
        col("slot", "INT"),
        col("site", "VARCHAR"),
        col("reading", "INT"),
      ],
      dataset: categories.map((category, i) => [1, category, i]),
    }),
  ])
  const rows = firstAxis(opt.yAxis).data as string[]
  const data = seriesList(opt.series)[0].data as [
    number,
    number,
    number,
    number,
  ][]
  expect(new Set(data.map((cell) => cell[1])).size).toBe(categories.length)
  expect(data.map((cell) => rows[cell[1]])).toEqual([
    "[NULL] (3)",
    "[empty] (2)",
    "[NULL]",
    "[empty]",
    "[NULL] (2)",
  ])
})

it("orders exact LONG heatmap X keys and keeps their own cell values", () => {
  const opt = buildEchartsOption({ xColumn: "slot" }, [
    resolved({
      type: "heatmap",
      xColumn: "slot",
      partitionByColumn: "site",
      yColumns: ["reading"],
      columns: [
        col("slot", "LONG"),
        col("site", "SYMBOL"),
        col("reading", "INT"),
      ],
      dataset: [
        ["9007199254740993", "west", 1],
        ["9007199254740992", "west", 2],
        ["-9007199254740992", "west", 3],
        ["-9007199254740993", "west", 4],
      ],
    }),
  ])
  expect(firstAxis(opt.xAxis).data).toEqual([
    "-9007199254740993",
    "-9007199254740992",
    "9007199254740992",
    "9007199254740993",
  ])
  expect(seriesList(opt.series)[0].data).toEqual([
    [3, 0, 1, 1],
    [2, 0, 2, 2],
    [1, 0, 3, 3],
    [0, 0, 4, 4],
  ])
})
