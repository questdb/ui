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
  needsWheelZoom,
  needsZoomSlider,
  WHEEL_ZOOM_HEADROOM,
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

  it("uses the exact width instead of rounding a narrow chart up", () => {
    expect(needsZoomSlider(bars(35, 1), 351)).toBe(true)
    expect(needsZoomSlider(bars(35, 1), 400)).toBe(false)
  })
})

describe("needsWheelZoom", () => {
  it("arms the wheel at the headroom multiple of the readable floor", () => {
    // Given the most single bars that stay at the wheel threshold (3× the floor)
    const limit = readableSlots(
      singleBarFill,
      MIN_MARK_PX * WHEEL_ZOOM_HEADROOM,
    )
    // Then that many need no wheel and one more does
    expect(needsWheelZoom(bars(limit, 1), CONTAINER_PX)).toBe(false)
    expect(needsWheelZoom(bars(limit + 1, 1), CONTAINER_PX)).toBe(true)
  })

  it("offers the wheel without the slider while marks are tight but readable", () => {
    // Given a line denser than the wheel threshold but sparser than the floor
    const points = Math.floor(PLOT_PX / 2)
    // Then the invisible wheel zoom arms while the space-costing slider waits
    expect(needsWheelZoom(line(points), CONTAINER_PX)).toBe(true)
    expect(needsZoomSlider(line(points), CONTAINER_PX)).toBe(false)
  })
})

type ZoomComponents = [
  { type: string; disabled: boolean },
  { type: string; show: boolean },
]

describe("withZoomSlider", () => {
  it("embeds both zoom components inert on a sparse chart", () => {
    // Given a sparse chart
    const option = withZoomSlider(bars(15, 1), CONTAINER_PX)
    // Then the components exist but neither is active, so density changes can
    // never alter the option's structure, and the grid keeps its margin
    const [inside, slider] = option.dataZoom as ZoomComponents
    expect(inside).toMatchObject({ type: "inside", disabled: true })
    expect(slider).toMatchObject({ type: "slider", show: false })
    expect((option.grid as { bottom: number }).bottom).toBe(56)
  })

  it("activates the wheel alone on a tight chart", () => {
    const option = withZoomSlider(line(Math.floor(PLOT_PX / 2)), CONTAINER_PX)

    const [inside, slider] = option.dataZoom as ZoomComponents
    expect(inside).toMatchObject({ disabled: false })
    expect(slider).toMatchObject({ show: false })
    expect((option.grid as { bottom: number }).bottom).toBe(56)
  })

  it("activates the wheel and the slider together on a dense chart", () => {
    // Given a dense chart
    const option = withZoomSlider(line(PLOT_PX * 2), CONTAINER_PX)
    // Then both zooms are active and the grid grows at the bottom
    const [inside, slider] = option.dataZoom as ZoomComponents
    expect(inside).toMatchObject({ type: "inside", disabled: false })
    expect(slider).toMatchObject({ type: "slider", show: true })
    expect((option.grid as { bottom: number }).bottom).toBe(86)
  })

  it("leaves an axis-less chart without zoom components", () => {
    // Given a pie option (no xAxis to zoom)
    const option = withZoomSlider({ series: [{ type: "pie" }] }, CONTAINER_PX)

    expect(option.dataZoom).toBeUndefined()
  })
})
