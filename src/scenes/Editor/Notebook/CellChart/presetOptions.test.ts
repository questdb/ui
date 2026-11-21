import { describe, expect, it } from "vitest"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import { lightColors } from "../../../../theme"
import {
  buildEchartsOption,
  thresholdSource,
  withZoomDensity,
  type ResolvedQuery,
} from "./buildEchartsOption"
import {
  mapChartOptions,
  mapQueryChart,
} from "../../../../utils/tools/chartConfigWire"
import { toChartConfigWire } from "../../../../utils/ai/notebookSnapshot"
import { drawProblems, resolveDraw } from "../DrawCanvas/drawCanvasUtils"
import { chartOptionsOffered, withoutUnofferedOptions } from "./chartOptions"
import { chartZoomDensity } from "./chartDensity"

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

type Loose = Record<string, unknown>
const seriesOf = (option: unknown) => (option as { series: Loose[] }).series
const first = (axis: unknown) => (Array.isArray(axis) ? axis[0] : axis) as Loose

const venues = query({
  type: "bar",
  columns: [col("venue", "SYMBOL"), col("volume", "DOUBLE")],
  dataset: [
    ["EBS", 30],
    ["LMAX", 10],
  ],
  xColumn: "venue",
  yColumns: ["volume"],
})

describe("preset options", () => {
  it("lays bars down: categories down the side, values across from zero", () => {
    // Given / When
    const option = buildEchartsOption({ xColumn: "venue", horizontal: true }, [
      venues,
    ])

    // Then
    expect(first(option.yAxis)).toMatchObject({
      type: "category",
      data: ["EBS", "LMAX"],
      inverse: true,
    })
    expect(first(option.xAxis)).toMatchObject({ type: "value", scale: false })
    expect(seriesOf(option)[0]).toMatchObject({ xAxisIndex: 0 })
    // The renderer zooms along the rows
    const zoomed = withZoomDensity(option, { slider: false, wheel: true })
    expect((zoomed.dataZoom as Loose[])[0]).toMatchObject({
      type: "inside",
      yAxisIndex: 0,
      disabled: false,
    })
  })

  it("keeps a chart with lines upright even when horizontal is set", () => {
    // Given
    const line = { ...venues, index: 1, type: "line" as const }

    // When
    const option = buildEchartsOption({ xColumn: "venue", horizontal: true }, [
      venues,
      line,
    ])

    // Then
    expect(first(option.xAxis)).toMatchObject({ type: "category" })
  })

  it("starts an axis of bars at zero, but fits other axes to their values", () => {
    // Given / When
    const bars = buildEchartsOption({ xColumn: "venue" }, [venues])
    const lines = buildEchartsOption({ xColumn: "venue" }, [
      { ...venues, type: "line" },
    ])

    // Then
    expect(first(bars.yAxis)).toMatchObject({ scale: false })
    expect(first(lines.yAxis)).toMatchObject({ scale: true })
  })

  it("stacks areas to shares of 100 per x", () => {
    // Given two fuels over two hours
    const mix = query({
      type: "area",
      percentStack: true,
      columns: [
        col("ts", "TIMESTAMP"),
        col("fuel", "SYMBOL"),
        col("mw", "DOUBLE"),
      ],
      dataset: [
        ["2026-01-01T00:00:00.000000Z", "gas", 30],
        ["2026-01-01T00:00:00.000000Z", "wind", 10],
        ["2026-01-01T01:00:00.000000Z", "gas", 5],
        ["2026-01-01T01:00:00.000000Z", "wind", 15],
      ],
      xColumn: "ts",
      yColumns: ["mw"],
      partitionByColumn: "fuel",
    })

    // When
    const option = buildEchartsOption({ xColumn: "ts" }, [mix])

    // Then
    const [gas, wind] = seriesOf(option)
    expect(gas.data).toEqual([
      ["2026-01-01T00:00:00.000000Z", 75],
      ["2026-01-01T01:00:00.000000Z", 25],
    ])
    expect(wind.data).toEqual([
      ["2026-01-01T00:00:00.000000Z", 25],
      ["2026-01-01T01:00:00.000000Z", 75],
    ])
    expect(gas.stack).toBe(wind.stack)
    expect(first(option.yAxis)).toMatchObject({ min: 0, max: 100 })
    const tooltip = gas.tooltip as { valueFormatter: (v: unknown) => string }
    expect(tooltip.valueFormatter(75)).toBe("75.0%")
  })

  it("draws a pie as a full pie, a ring or a half ring", () => {
    // Given
    const pie = (pieShape?: "pie" | "donut" | "halfDonut") =>
      seriesOf(
        buildEchartsOption({ xColumn: "venue" }, [
          { ...venues, type: "pie", pieShape },
        ]),
      )[0]

    // When / Then
    expect(pie("pie").radius).toBe("70%")
    expect(pie(undefined).radius).toEqual(["35%", "70%"])
    expect(pie("halfDonut")).toMatchObject({ startAngle: 180, endAngle: 360 })
  })

  it("sizes and colours points by columns", () => {
    // Given
    const points = query({
      type: "scatter",
      columns: [
        col("spread", "DOUBLE"),
        col("latency", "DOUBLE"),
        col("volume", "DOUBLE"),
        col("score", "DOUBLE"),
      ],
      dataset: [
        [1, 2, 0, 10],
        [3, 4, 100, 90],
      ],
      xColumn: "spread",
      yColumns: ["latency"],
      scatter: { size: "volume", color: "score" },
    })

    // When
    const option = buildEchartsOption({ xColumn: "spread" }, [points], {
      colors: lightColors,
    })

    // Then
    const s = seriesOf(option)[0]
    expect(s.data).toEqual([
      [1, 2, 0, 10],
      [3, 4, 100, 90],
    ])
    const size = s.symbolSize as (v: unknown) => number
    expect(size([1, 2, 0, 10])).toBe(6)
    expect(size([3, 4, 100, 90])).toBe(32)
    expect(option.visualMap).toMatchObject({
      dimension: 3,
      min: 10,
      max: 90,
      seriesIndex: [0],
    })
    expect(option.tooltip).toMatchObject({ trigger: "item" })
    // The colour scale names its column
    expect((option.visualMap as { text: string[] }).text[1]).toMatch(/^score/)
  })

  it("shows each of a point's values in its own column's format", () => {
    // Given latency in ms and volume compact
    const points = query({
      type: "scatter",
      columns: [
        col("spread", "DOUBLE"),
        col("latency", "DOUBLE"),
        col("volume", "DOUBLE"),
      ],
      dataset: [[1, 2.5, 12000]],
      xColumn: "spread",
      yColumns: ["latency"],
      scatter: { size: "volume" },
    })
    const option = buildEchartsOption({ xColumn: "spread" }, [points], {
      formats: {
        latency: { decimals: 1, suffix: " ms" },
        volume: { compact: true },
      },
    })

    // When
    const tooltip = seriesOf(option)[0].tooltip as {
      formatter: (p: unknown) => string
    }
    const html = tooltip.formatter({
      seriesName: "latency",
      value: [1, 2.5, 12000, null],
    })

    // Then
    expect(html).toContain("latency <b>2.5 ms</b>")
    expect(html).toContain("volume <b>12K</b>")
    expect(html).not.toContain("12000 ms")
  })

  it("draws a format's thresholds as lines or bands, and keeps them in view", () => {
    // Given CPU with warning and breach thresholds
    const cpu = query({
      columns: [col("ts", "TIMESTAMP"), col("cpu", "DOUBLE")],
      dataset: [
        ["2026-01-01T00:00:00.000000Z", 40],
        ["2026-01-01T01:00:00.000000Z", 60],
      ],
      xColumn: "ts",
      yColumns: ["cpu"],
    })
    const context = {
      colors: lightColors,
      formats: {
        cpu: {
          suffix: "%",
          baseTone: "positive" as const,
          thresholds: [
            { value: 70, tone: "warning" as const },
            { value: 85, tone: "negative" as const },
          ],
        },
      },
    }

    // When
    const lines = buildEchartsOption(
      { xColumn: "ts", thresholds: "lines" },
      [cpu],
      context,
    )
    const bands = buildEchartsOption(
      { xColumn: "ts", thresholds: "bands" },
      [cpu],
      context,
    )

    // Then
    const marks = seriesOf(lines).find((s) => s.name === "Thresholds")
    expect(
      (marks?.markLine as { data: Loose[] }).data.map((d) => d.yAxis),
    ).toEqual([70, 85])
    expect(first(lines.yAxis)).toMatchObject({ dataMin: 70, dataMax: 85 })
    expect((lines.legend as { data: string[] }).data).toEqual(["cpu"])
    const areas = seriesOf(bands).find((s) => s.name === "Thresholds")
      ?.markArea as { data: [Loose, Loose][] }
    expect(areas.data.map(([from]) => from.itemStyle)).toEqual([
      { color: lightColors.chartUp, opacity: 0.1 },
      { color: lightColors.statusWarning, opacity: 0.1 },
      { color: lightColors.chartDown, opacity: 0.1 },
    ])
  })

  it("builds threshold bands for 160,000 points without spreading them as arguments", () => {
    const names = Array.from({ length: 16 }, (_, i) => `metric${i}`)
    const dataset = Array.from({ length: 10_000 }, (_, i) => [
      i,
      ...names.map((_, j) => i + j),
    ])
    const option = buildEchartsOption(
      { xColumn: "axis", thresholds: "bands" },
      [
        query({
          columns: [
            col("axis", "INT"),
            ...names.map((name) => col(name, "INT")),
          ],
          dataset,
          xColumn: "axis",
          yColumns: names,
        }),
      ],
      {
        colors: lightColors,
        formats: { metric0: { thresholds: [{ value: 100, tone: "warning" }] } },
      },
    )
    expect(
      seriesOf(option).find((series) => series.name === "Thresholds"),
    ).toHaveProperty("markArea")
  })

  it("takes thresholds only from values on the left axis", () => {
    // Given a 100% stacked area and a right-axis line whose formats have thresholds
    const formats = {
      share: { thresholds: [{ value: 50, tone: "warning" as const }] },
      rsi: { thresholds: [{ value: 70, tone: "warning" as const }] },
      cpu: { thresholds: [{ value: 80, tone: "negative" as const }] },
    }
    const stacked = query({
      type: "area",
      percentStack: true,
      yColumns: ["share"],
    })
    const right = query({ yColumns: ["rsi"], axis: "right" })
    const left = query({ yColumns: ["cpu"] })

    // When / Then
    expect(thresholdSource([stacked, right], formats)).toBeUndefined()
    expect(thresholdSource([stacked, right, left], formats)?.column).toBe("cpu")
  })

  it("drops options a chart no longer offers when saving", () => {
    // Given a laid-down chart that became a pie, with thresholds
    const tab = {
      index: 0,
      label: "Q1",
      query: "a",
      columns: [col("venue", "SYMBOL"), col("volume", "DOUBLE")],
      xColumn: "venue",
      compatible: true,
      inferredChart: { type: "bar" as const, yColumns: ["volume"] },
    }

    // When
    const saved = withoutUnofferedOptions(
      {
        xColumn: "venue",
        horizontal: true,
        thresholds: "lines",
        queries: [{ type: "pie", yColumns: ["volume"] }],
      },
      [tab],
    )

    // Then
    expect(saved.horizontal).toBeUndefined()
    expect(saved.thresholds).toBeUndefined()
  })

  it("offers options by the queries the chart draws", () => {
    // Given bars, a line on another x-axis (left out), and a pie next to a line
    const tab = (index: number, compatible: boolean) => ({
      index,
      label: `Q${index + 1}`,
      query: "a",
      columns: [col("venue", "SYMBOL"), col("volume", "DOUBLE")],
      xColumn: "venue",
      compatible,
      inferredChart: { type: "bar" as const, yColumns: ["volume"] },
    })
    const formats = {
      volume: { thresholds: [{ value: 1, tone: "warning" as const }] },
    }

    // When
    const barsAndLeftOut = chartOptionsOffered(
      {
        xColumn: "venue",
        queries: [
          { type: "bar", yColumns: ["volume"] },
          { type: "line", yColumns: ["volume"] },
        ],
      },
      [tab(0, true), tab(1, false)],
      formats,
    )
    const pieAndLine = chartOptionsOffered(
      {
        xColumn: "venue",
        queries: [
          { type: "pie", yColumns: ["volume"] },
          { type: "line", yColumns: ["volume"] },
        ],
      },
      [tab(0, true), tab(1, true)],
      formats,
    )

    // Then the left-out line does not stop the bars lying down, and a pie
    // next to a line is left out, so the line's thresholds are offered
    expect(barsAndLeftOut.lieDown).toBe(true)
    expect(pieAndLine).toMatchObject({
      lieDown: false,
      thresholds: true,
      thresholdColumn: "volume",
    })
  })

  it("measures crowding of lying bars down the plot's height", () => {
    // Given 30 bars lying down
    const bars = query({
      type: "bar",
      columns: [col("venue", "SYMBOL"), col("volume", "DOUBLE")],
      dataset: Array.from({ length: 30 }, (_, i) => [`v${i}`, i + 1]),
      xColumn: "venue",
      yColumns: ["volume"],
    })
    const option = buildEchartsOption({ xColumn: "venue", horizontal: true }, [
      bars,
    ])

    // When / Then: a wide, short cell is crowded, a tall one is not
    expect(chartZoomDensity(option, 1000, 300).wheel).toBe(true)
    expect(chartZoomDensity(option, 300, 3000).wheel).toBe(false)
  })

  it("maps the agent's options both ways", () => {
    // Given / When
    const q = mapQueryChart({
      type: "scatter",
      y_columns: ["y"],
      percent_stack: null,
      pie_shape: null,
      scatter: { size: "n", color: null },
    })

    // Then
    expect(q).toEqual({
      type: "scatter",
      yColumns: ["y"],
      scatter: { size: "n" },
    })
    expect(mapChartOptions({ horizontal: true, thresholds: "bands" })).toEqual({
      horizontal: true,
      thresholds: "bands",
    })
    // null leaves a switch alone; false and "off" clear it
    expect(mapChartOptions({ horizontal: null, thresholds: null })).toEqual({})
    expect(mapChartOptions({ horizontal: false, thresholds: "off" })).toEqual({
      horizontal: undefined,
      thresholds: undefined,
    })
    expect(
      toChartConfigWire({
        xColumn: "x",
        horizontal: true,
        thresholds: "lines",
        queries: [{ type: "pie", yColumns: ["v"], pieShape: "halfDonut" }],
      }),
    ).toMatchObject({
      horizontal: true,
      thresholds: "lines",
      queries: [{ pie_shape: "halfDonut" }],
    })
  })

  it("reports options that cannot apply", () => {
    // Given a line chart asked to lie down and to draw thresholds it lacks
    const columns = [col("ts", "TIMESTAMP"), col("n", "LONG")]
    const result = {
      query: "a",
      columns,
      dataset: [["2026-01-01T00:00:00.000000Z", 1]],
      count: 1,
      timestamp: -1,
    }
    const config = {
      xColumn: "ts",
      horizontal: true,
      thresholds: "lines" as const,
      queries: [{ type: "line" as const, yColumns: ["n"] }],
    }

    // When
    const problems = drawProblems(
      resolveDraw(["a"], [result] as never, config),
      config,
      {},
    )

    // Then
    expect(problems.map((p) => p.message)).toEqual([
      expect.stringMatching(/^horizontal is ignored: .*Q1 is line/) as string,
      expect.stringMatching(/^thresholds draws nothing/) as string,
    ])
  })
})
