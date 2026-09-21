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

const PALETTE = { up: "#0f0", down: "#f00", neutral: "#888" }
const VIEWPORT = { height: 400 }
const build = (
  chart: ChartGlobals,
  queries: ResolvedQuery[],
  viewport = VIEWPORT,
) => buildEchartsOption(chart, queries, PALETTE, viewport)

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
    const opt = build(chart, [
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

  it("spans a numeric x-axis edge to edge for line-family series and hides the boundary labels", () => {
    // Given / When
    const opt = build(chart, [
      resolved({
        columns: depthColumns,
        dataset: depthDataset,
        xColumn: "price",
        type: "stepArea",
        yColumns: ["cum_bid", "cum_ask"],
      }),
    ])
    // Then
    const x = firstAxis(opt.xAxis)
    expect(x.min).toBe("dataMin")
    expect(x.max).toBe("dataMax")
    expect(x.axisLabel).toMatchObject({
      showMinLabel: false,
      showMaxLabel: false,
    })
  })

  it("keeps the rounded padding for scatter over a numeric x and for a single x value", () => {
    // Given
    const scatter = build(chart, [
      resolved({
        columns: depthColumns,
        dataset: depthDataset,
        xColumn: "price",
        type: "scatter",
        yColumns: ["cum_bid"],
      }),
    ])
    const singleX = build(chart, [
      resolved({
        columns: depthColumns,
        dataset: [
          [100, 5, null],
          [100, 3, null],
        ],
        xColumn: "price",
        type: "line",
        yColumns: ["cum_bid"],
      }),
    ])
    // When / Then
    for (const opt of [scatter, singleX]) {
      const x = firstAxis(opt.xAxis)
      expect(x.scale).toBe(true)
      expect(x.min).toBeUndefined()
      expect(x.max).toBeUndefined()
    }
  })

  it("holds the last point of each non-null run for one interval in a step series", () => {
    // Given a bid/ask depth shape: bids end at 102, asks start at 103
    const opt = build(chart, [
      resolved({
        columns: depthColumns,
        dataset: [
          [100, 5, null],
          [101, 3, null],
          [102, 1, null],
          [103, null, 4],
          [104, null, 7],
        ],
        xColumn: "price",
        type: "stepArea",
        yColumns: ["cum_bid", "cum_ask"],
      }),
    ])
    // When
    const [bids, asks] = seriesList(opt.series).map(
      (s) => s.data as (number | null)[][],
    )
    // Then the bid run gains [103, 1] before its nulls, the ask run gains [105, 7] at the end
    expect(bids).toEqual([
      [100, 5],
      [101, 3],
      [102, 1],
      [103, 1],
      [103, null],
      [104, null],
    ])
    expect(asks).toEqual([
      [100, null],
      [101, null],
      [102, null],
      [103, 4],
      [104, 7],
      [105, 7],
    ])
  })

  it("sorts value-mode points by x, then holds the step end; a plain line only sorts", () => {
    // Given a descending result, as a bids query ordered by price DESC returns
    const dataset = [
      [104, 7],
      [103, 4],
    ]
    const columns = [col("price", "DOUBLE"), col("cum_ask", "DOUBLE")]
    const dataFor = (type: "stepLine" | "line") =>
      seriesList(
        build(chart, [
          resolved({
            columns,
            dataset,
            xColumn: "price",
            type,
            yColumns: ["cum_ask"],
          }),
        ]).series,
      )[0].data
    // When / Then
    expect(dataFor("stepLine")).toEqual([
      [103, 4],
      [104, 7],
      [105, 7],
    ])
    expect(dataFor("line")).toEqual([
      [103, 4],
      [104, 7],
    ])
  })

  it("combines two numeric-x statements and labels a shared series name with each statement", () => {
    // Given bids and asks that both select `size`
    const columns = [col("price", "DOUBLE"), col("size", "DOUBLE")]
    const bids = resolved({
      index: 0,
      columns,
      dataset: [
        [100, 5],
        [101, 3],
      ],
      xColumn: "price",
      type: "stepArea",
      yColumns: ["size"],
    })
    const asks = resolved({
      index: 1,
      columns,
      dataset: [
        [102, 4],
        [103, 7],
      ],
      xColumn: "price",
      type: "stepArea",
      yColumns: ["size"],
    })
    // When
    const series = seriesList(build(chart, [bids, asks]).series)
    // Then
    expect(series.map((s) => s.name)).toEqual(["Q1 · size", "Q2 · size"])
    expect(firstAxis(build(chart, [bids, asks]).xAxis).type).toBe("value")
  })

  it("uses a query name as the series name when the query has one y column", () => {
    // Given
    const columns = [col("price", "DOUBLE"), col("size", "DOUBLE")]
    const named = (index: number, name: string) =>
      resolved({
        index,
        columns,
        dataset: [[100 + index, 1]],
        xColumn: "price",
        type: "line",
        yColumns: ["size"],
        name,
      })
    // When
    const series = seriesList(
      build(chart, [named(0, "bids"), named(1, "asks")]).series,
    )
    // Then
    expect(series.map((s) => s.name)).toEqual(["bids", "asks"])
  })

  it("stepArea emits stepped, area-filled line series with [x,y] numeric pairs", () => {
    const opt = build(chart, [
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
    // x is carried positionally as [price, value] pairs along the value axis;
    // the bid run holds its last value for one more interval.
    expect(series[0].data).toEqual([
      [100, 5],
      [101, 3],
      [102, 3],
      [102, null],
      [103, null],
    ])
  })

  it("stepLine is stepped but NOT area-filled", () => {
    const opt = build(chart, [
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
    const opt = build(chart, [
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
    const opt = build({ xColumn: "ts" }, [
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

  it("leaves a pure bar chart fully opaque (no overlay)", () => {
    const opt = build({ xColumn: "ts" }, [
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

  it("pins and titles the left axis from leftAxis while the right axis autoscales", () => {
    // Given
    const chart: ChartGlobals = {
      xColumn: "ts",
      leftAxis: { name: "Price", min: 0, max: 100 },
    }
    // When
    const opt = build(chart, [
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
    const [left, right] = opt.yAxis as Record<string, unknown>[]
    expect(left).toMatchObject({ name: "Price", min: 0, max: 100 })
    expect(right.min).toBeUndefined()
    expect(right.max).toBeUndefined()
  })

  it("anchors each y-axis title to its own axis so a long title grows over the plot", () => {
    // Given / When
    const opt = build(
      { xColumn: "ts", leftAxis: { name: "Buy share of volume (%)" } },
      [
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
      ],
    )
    // Then
    const [left, right] = opt.yAxis as Record<string, { align?: string }>[]
    expect(left.nameTextStyle.align).toBe("left")
    expect(right.nameTextStyle.align).toBe("right")
  })

  it("keeps the left axis autoscaled when leftAxis is absent", () => {
    // Given / When
    const opt = build({ xColumn: "ts" }, [
      resolved({
        columns,
        dataset,
        xColumn: "ts",
        type: "line",
        yColumns: ["close"],
      }),
    ])
    // Then
    const left = firstAxis(opt.yAxis)
    expect(left.min).toBeUndefined()
    expect(left.max).toBeUndefined()
    expect(left.name).toBeUndefined()
  })

  it("emits an empty candle ('-') when any OHLC component is null", () => {
    const ohlcColumns = [
      col("ts", "TIMESTAMP"),
      col("open", "DOUBLE"),
      col("high", "DOUBLE"),
      col("low", "DOUBLE"),
      col("close", "DOUBLE"),
    ]
    const opt = build({ xColumn: "ts" }, [
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
    const opt = build({ xColumn: "a" }, [
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
    const opt = build({ xColumn: "side" }, [
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
    const opt = build({ xColumn: "side" }, [
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
    const opt = build({ xColumn: "region" }, [
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
    const opt = build({ xColumn: "ts" }, [
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

describe("buildEchartsOption — timestamps render in the browser's zone", () => {
  it("formats a temporal x-axis in the browser's zone, like typed ranges", () => {
    // Given a designated timestamp plotted against a numeric column
    const columns = [col("ts", "TIMESTAMP"), col("price", "DOUBLE")]
    const dataset: (number | null)[][] = [
      [1704067200000, 42],
      [1704153600000, 43],
    ]

    // When the chart option is built
    const opt = build({ xColumn: "ts" }, [
      resolved({ columns, dataset, xColumn: "ts", yColumns: ["price"] }),
    ])

    // Then echarts formats in the browser's zone, not UTC
    expect(firstAxis(opt.xAxis).type).toBe("time")
    expect(opt.useUTC).toBe(false)
  })
})

describe("buildEchartsOption — candlestick with a volume sub-pane", () => {
  const columns = [
    col("ts", "TIMESTAMP"),
    col("open", "DOUBLE"),
    col("high", "DOUBLE"),
    col("low", "DOUBLE"),
    col("close", "DOUBLE"),
    col("volume", "DOUBLE"),
  ]
  const dataset: (number | null)[][] = [
    [1000, 10, 12, 9, 11, 500],
    [2000, 11, 13, 10, 9, 700],
    [3000, null, 9, 9, 9, 300],
  ]
  const ohlc = { open: "open", high: "high", low: "low", close: "close" }
  const candle = (over: Partial<ResolvedQuery>) =>
    resolved({
      columns,
      dataset,
      xColumn: "ts",
      type: "candlestick",
      ohlc,
      volume: "volume",
      ...over,
    })
  const records = (v: unknown) => v as Record<string, unknown>[]

  it("stacks a second pane with shared margins and a right-hand volume axis", () => {
    // Given / When
    const opt = build({ xColumn: "ts" }, [candle({})])
    // Then
    const [price, volume] = records(opt.grid)
    expect(price.left).toBe(volume.left)
    expect(price.right).toBe(volume.right)
    // A fifth of the plot area: (400 - 40 top - 78 bottom - 5 gap) * 0.2
    expect(volume.height).toBe(55)
    // Tick labels and the axis title sit under the volume pane, above the legend
    expect(volume.bottom).toBe(56 + 22)
    expect(price.bottom).toBe(56 + 22 + 55 + 5)
    const [xPrice, xVolume] = records(opt.xAxis)
    expect(xPrice).toMatchObject({
      axisLabel: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
    })
    expect(xVolume.gridIndex).toBe(1)
    expect(records(opt.yAxis)).toHaveLength(2)
    const volumeAxis = records(opt.yAxis)[1]
    expect(volumeAxis).toMatchObject({ gridIndex: 1, position: "right" })
    expect(volumeAxis.max).toBeCloseTo(740)
    expect(volumeAxis.axisLabel).toMatchObject({
      showMinLabel: false,
      showMaxLabel: false,
    })
  })

  it("lifts the floor under a steady band and ignores the bucket still filling", () => {
    // Given twenty 15-minute buckets near 4.1B and one partial bucket at 852M
    const rows = Array.from({ length: 20 }, (_, i) => [
      i * 1000,
      1.33,
      1.34,
      1.32,
      1.335,
      4_100_000_000 + i * 5_000_000,
    ])
    rows.push([20_000, 1.33, 1.34, 1.32, 1.335, 852_539_807])
    // When
    const opt = build({ xColumn: "ts" }, [candle({ dataset: rows })])
    const axis = records(opt.yAxis)[1] as { min: number; max: number }
    // Then the band fills the pane and the partial bucket falls below the floor
    expect(axis.min).toBeGreaterThan(4_000_000_000)
    expect(axis.min).toBeLessThan(4_100_000_000)
    expect(axis.max).toBeCloseTo(4_204_000_000)
  })

  it("keeps a zero floor for spiky volume", () => {
    // Given
    const rows = [1_000_000, 5_000_000, 20_000_000, 100_000_000].map((v, i) => [
      i * 1000,
      1,
      2,
      0.5,
      1.5,
      v,
    ])
    // When
    const opt = build({ xColumn: "ts" }, [candle({ dataset: rows })])
    // Then
    expect((records(opt.yAxis)[1] as { min: number }).min).toBe(0)
  })

  it("scales the volume pane with the cell and never drops under its floor", () => {
    // Given / When
    const tall = records(
      build({ xColumn: "ts" }, [candle({})], { height: 900 }).grid,
    )
    const small = records(
      build({ xColumn: "ts" }, [candle({})], { height: 200 }).grid,
    )
    const unmeasured = records(
      build({ xColumn: "ts" }, [candle({})], { height: 0 }).grid,
    )
    // Then
    expect(tall[1].height).toBe(155)
    expect(small[1].height).toBe(48)
    expect(unmeasured[1].height).toBe(48)
  })

  it("colours each bar by its candle direction through a hidden visual map", () => {
    // Given / When
    const opt = build({ xColumn: "ts" }, [candle({})])
    const bars = seriesList(opt.series).find((s) => s.type === "bar")
    // Then: up, down, and unknown direction as a third value per row
    expect(bars).toMatchObject({
      id: "volume-0",
      name: "volume",
      xAxisIndex: 1,
      yAxisIndex: 1,
    })
    expect(seriesList(opt.series)[0].id).toBe("candle-0")
    expect(bars?.data).toEqual([
      [1000, 500, 1],
      [2000, 700, -1],
      [3000, 300, 0],
    ])
    expect((bars?.itemStyle as { opacity: number }).opacity).toBe(0.7)
    expect(opt.visualMap).toMatchObject({
      show: false,
      dimension: 2,
      seriesIndex: [1],
      pieces: [
        { value: 1, color: PALETTE.up },
        { value: -1, color: PALETTE.down },
        { value: 0, color: PALETTE.neutral },
      ],
    })
  })

  it("links the two panes and zooms both x-axes together", () => {
    // Given enough rows for the zoom slider
    const rows = Array.from({ length: 250 }, (_, i) => [
      i * 1000,
      10,
      12,
      9,
      11,
      100,
    ])
    // When
    const opt = build({ xColumn: "ts" }, [candle({ dataset: rows })])
    // Then
    expect(opt.axisPointer).toEqual({ link: [{ xAxisIndex: "all" }] })
    for (const axis of records(opt.xAxis)) {
      expect(axis.axisPointer).toEqual({ label: { show: false } })
    }
    for (const zoom of records(opt.dataZoom)) {
      expect(zoom.xAxisIndex).toEqual([0, 1])
    }
  })

  it("places the volume axis after an existing right axis and prints compact labels", () => {
    // Given
    const rsi = resolved({
      index: 1,
      columns,
      dataset,
      xColumn: "ts",
      type: "line",
      yColumns: ["close"],
      axis: "right",
    })
    // When
    const opt = build({ xColumn: "ts" }, [candle({}), rsi])
    // Then
    const yAxes = records(opt.yAxis)
    expect(yAxes).toHaveLength(3)
    const bars = seriesList(opt.series).find((s) => s.type === "bar")
    expect(bars?.yAxisIndex).toBe(2)
    const format = (yAxes[2].axisLabel as { formatter: (v: number) => string })
      .formatter
    expect([950, 1500, 2_000_000, 3_500_000_000].map(format)).toEqual([
      "950",
      "1.5k",
      "2M",
      "3.5B",
    ])
  })

  it("writes one OHLCV block for both panes", () => {
    // Given
    const opt = build({ xColumn: "ts" }, [candle({})])
    const formatter = (opt.tooltip as { formatter: (p: unknown) => string })
      .formatter
    const at = "2026-09-19 05:00:00"
    const params = [
      {
        seriesId: "candle-0",
        seriesType: "candlestick",
        seriesName: "OHLC",
        marker: "<m/>",
        axisValueLabel: at,
        value: [0, 1.1446, 1.1425, 1.137, 1.1477],
      },
      {
        seriesId: "volume-0",
        seriesType: "bar",
        seriesName: "total_volume",
        marker: "<m/>",
        axisValueLabel: at,
        value: [0, 4_098_126_210, -1],
      },
    ]
    // When
    const html = formatter(params)
    // Then: one header, one marker, the volume folded under an OHLCV title
    expect(html.split(at)).toHaveLength(2)
    expect(html.split("<m/>")).toHaveLength(2)
    expect(html).toContain("OHLCV")
    expect(html).toContain("1.1446")
    expect(html).toMatch(/total_volume<\/span><b>4,098,126,210/)
    expect(html).not.toContain("-1</b>")
  })

  it("keeps a single pane without a volume column and on a categorical x", () => {
    // Given / When
    const noVolume = build({ xColumn: "ts" }, [candle({ volume: undefined })])
    const categorical = build({ xColumn: "sym" }, [
      candle({
        columns: [col("sym", "SYMBOL"), ...columns.slice(1)],
        dataset: [["EURUSD", 10, 12, 9, 11, 500]],
        xColumn: "sym",
      }),
    ])
    // Then
    expect(Array.isArray(noVolume.grid)).toBe(false)
    expect(noVolume.visualMap).toBeUndefined()
    expect(Array.isArray(categorical.grid)).toBe(false)
  })
})
