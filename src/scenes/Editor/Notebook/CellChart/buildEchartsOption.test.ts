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
  // Partition "A" has both regions (north twice → first-write-wins);
  // partition "B" only has north → south must align to null, not shift.
  const dataset: (string | number)[][] = [
    ["north", "A", 10],
    ["south", "A", 20],
    ["north", "B", 30],
    ["north", "A", 99],
  ]

  it("pivots partitions to series and aligns each to the category union (first row wins, missing → null)", () => {
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
    // A: north keeps the first row (10, not 99); south present (20).
    expect(a?.data).toEqual([10, 20])
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
