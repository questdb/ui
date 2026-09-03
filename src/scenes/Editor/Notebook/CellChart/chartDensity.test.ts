import { describe, it, expect } from "vitest"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import {
  buildEchartsOption,
  withZoomSlider,
  type ResolvedQuery,
} from "./buildEchartsOption"
import {
  MIN_MARK_PX,
  MIN_POINT_PX,
  needsZoomSlider,
  snapChartWidth,
} from "./chartDensity"

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

// 800px container, 24 + 36 grid padding, 48px of y-axis labels: 692px plot.
const CONTAINER_PX = 800
const PLOT_PX = 692
const WIDE_CONTAINER_PX = 1600

// The most marks the plot can show at the readable floor, per mark type.
const readableSlots = (fillRatio: number, minPx: number) =>
  Math.floor((PLOT_PX * fillRatio) / minPx)
const singleBarFill = 0.8
const threeBarFill = 0.8 / (1.2 * 3 - 0.2)
const candleFill = 0.5

const rows = (count: number, valuesPerRow: number): number[][] =>
  Array.from({ length: count }, (_, i) => [
    i * 60_000,
    ...Array.from({ length: valuesPerRow }, (_, j) => i + j),
  ])

const bars = (count: number, seriesCount: number) => {
  const yColumns = Array.from({ length: seriesCount }, (_, j) => `y${j}`)
  return buildEchartsOption({ xColumn: "ts" }, [
    resolved({
      columns: [
        col("ts", "TIMESTAMP"),
        ...yColumns.map((y) => col(y, "DOUBLE")),
      ],
      dataset: rows(count, seriesCount),
      xColumn: "ts",
      type: "bar",
      yColumns,
    }),
  ])
}

const candles = (count: number) =>
  buildEchartsOption({ xColumn: "ts" }, [
    resolved({
      columns: [
        col("ts", "TIMESTAMP"),
        col("open", "DOUBLE"),
        col("high", "DOUBLE"),
        col("low", "DOUBLE"),
        col("close", "DOUBLE"),
      ],
      dataset: rows(count, 4),
      xColumn: "ts",
      type: "candlestick",
      yColumns: [],
      ohlc: { open: "open", high: "high", low: "low", close: "close" },
    }),
  ])

const line = (count: number) =>
  buildEchartsOption({ xColumn: "ts" }, [
    resolved({
      columns: [col("ts", "TIMESTAMP"), col("v", "DOUBLE")],
      dataset: rows(count, 1),
      xColumn: "ts",
      type: "line",
      yColumns: ["v"],
    }),
  ])

describe("needsZoomSlider", () => {
  it("asks for a slider only once single-series bars fall under the readable width", () => {
    // Given the most single bars the plot can show at the floor
    const limit = readableSlots(singleBarFill, MIN_MARK_PX)
    // Then that many need no slider and one more does
    expect(needsZoomSlider(bars(limit, 1), CONTAINER_PX)).toBe(false)
    expect(needsZoomSlider(bars(limit + 1, 1), CONTAINER_PX)).toBe(true)
    // And the same bars in a container twice as wide are readable again
    expect(needsZoomSlider(bars(limit + 1, 1), WIDE_CONTAINER_PX)).toBe(false)
  })

  it("counts grouped bar series against the same band", () => {
    // Given three series sharing every band
    const limit = readableSlots(threeBarFill, MIN_MARK_PX)
    // Then the band count that keeps a column readable is a third of the single-series one
    expect(limit).toBeLessThan(readableSlots(singleBarFill, MIN_MARK_PX) / 3)
    expect(needsZoomSlider(bars(limit, 3), CONTAINER_PX)).toBe(false)
    expect(needsZoomSlider(bars(limit + 1, 3), CONTAINER_PX)).toBe(true)
  })

  it("uses the half-band candle body as the readable mark", () => {
    // Given the most candles whose bodies stay at the floor
    const limit = readableSlots(candleFill, MIN_MARK_PX)
    // Then that many need no slider and one more does
    expect(needsZoomSlider(candles(limit), CONTAINER_PX)).toBe(false)
    expect(needsZoomSlider(candles(limit + 1), CONTAINER_PX)).toBe(true)
  })

  it("asks for a slider on a line only once points outnumber pixels", () => {
    // Given a point per readable pixel
    const limit = readableSlots(1, MIN_POINT_PX)
    // Then that many need no slider and one more does
    expect(needsZoomSlider(line(limit), CONTAINER_PX)).toBe(false)
    expect(needsZoomSlider(line(limit + 1), CONTAINER_PX)).toBe(true)
  })

  it("never asks for a slider before the container is measured", () => {
    expect(needsZoomSlider(line(5000), 0)).toBe(false)
  })
})

describe("withZoomSlider", () => {
  it("leaves a sparse chart without any zoom", () => {
    // Given a sparse chart
    const option = withZoomSlider(bars(15, 1), CONTAINER_PX)
    // Then neither the slider nor the wheel zoom exists and the grid keeps its margin
    expect(option.dataZoom).toBeUndefined()
    expect((option.grid as { bottom: number }).bottom).toBe(56)
  })

  it("adds the wheel zoom and the slider together on a dense chart", () => {
    // Given a dense chart
    const option = withZoomSlider(line(PLOT_PX * 2), CONTAINER_PX)
    // Then both zooms appear and the grid grows at the bottom
    const zooms = option.dataZoom as { type: string }[]
    expect(zooms.map((z) => z.type)).toEqual(["inside", "slider"])
    expect((option.grid as { bottom: number }).bottom).toBe(86)
  })
})

describe("snapChartWidth", () => {
  it("rounds to 100px steps and never returns zero for a measured width", () => {
    expect(snapChartWidth(40)).toBe(100)
    expect(snapChartWidth(849)).toBe(800)
    expect(snapChartWidth(850)).toBe(900)
  })
})
