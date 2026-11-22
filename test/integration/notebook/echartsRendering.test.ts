import { describe, expect, it } from "vitest"
import { init, type CustomSeriesOption } from "echarts"
import {
  buildEchartsOption,
  withZoomDensity,
  type ResolvedQuery,
} from "../../../src/scenes/Editor/Notebook/CellChart/buildEchartsOption"

import {
  chartZoomDensity,
  withBoundedHeatmapLabels,
  withFittedHeatmapLegend,
  X_SLIDER_ZOOM_ID,
  X_WHEEL_ZOOM_ID,
  Y_SLIDER_ZOOM_ID,
} from "../../../src/scenes/Editor/Notebook/CellChart/chartDensity"

const createChart = (height = 400, width = 640) =>
  init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width,
    height,
  })

describe("notebook chart rendering", () => {
  it("removes a reference line and its bound without remounting the chart", () => {
    // Given a chart with a reference line above the data
    const query: ResolvedQuery = {
      index: 0,
      type: "line",
      axis: "left",
      xColumn: "slot",
      yColumns: ["reading"],
      columns: [
        { name: "slot", type: "INT" },
        { name: "reading", type: "DOUBLE" },
      ],
      dataset: [
        [1, 12],
        [2, 24],
      ],
    }
    const chart = createChart()
    try {
      chart.setOption(
        buildEchartsOption(
          {
            xColumn: "slot",
            referenceLines: [{ value: 70, label: "Reading limit" }],
          },
          [query],
        ),
      )
      expect(chart.renderToSVGString()).toContain("Reading limit")

      // When the user removes the line
      chart.setOption(buildEchartsOption({ xColumn: "slot" }, [query]), {
        replaceMerge: ["series"],
      })

      // Then the merged chart drops the old line and scaling bound
      expect(chart.renderToSVGString()).not.toContain("Reading limit")
      expect(chart.getOption().yAxis).toMatchObject([{ max: undefined }])
    } finally {
      chart.dispose()
    }
  })
  it("keeps an axis reference visible after toggling the first data series", () => {
    const query: ResolvedQuery = {
      index: 0,
      type: "line",
      axis: "left",
      xColumn: "slot",
      yColumns: ["reading", "baseline"],
      columns: [
        { name: "slot", type: "INT" },
        { name: "reading", type: "DOUBLE" },
        { name: "baseline", type: "DOUBLE" },
      ],
      dataset: [
        [1, 12, 20],
        [2, 24, 22],
      ],
    }
    const chart = createChart()
    try {
      chart.setOption(
        buildEchartsOption(
          {
            xColumn: "slot",
            referenceLines: [{ value: 70, label: "Reading limit" }],
          },
          [query],
        ),
      )
      chart.dispatchAction({ type: "legendUnSelect", name: "reading" })
      expect(chart.renderToSVGString()).toContain("Reading limit")
    } finally {
      chart.dispose()
    }
  })

  it("renders and clears reference lines for numeric scatter plots", () => {
    const query: ResolvedQuery = {
      index: 0,
      type: "scatter",
      axis: "left",
      xColumn: "slot",
      yColumns: ["reading"],
      columns: [
        { name: "slot", type: "INT" },
        { name: "reading", type: "DOUBLE" },
      ],
      dataset: [
        [1, 12],
        [2, 24],
      ],
    }
    const chart = createChart()
    try {
      chart.setOption(
        buildEchartsOption(
          {
            xColumn: "slot",
            referenceLines: [{ value: 70, label: "Reading limit" }],
          },
          [query],
        ),
      )
      expect(chart.renderToSVGString()).toContain("Reading limit")

      chart.setOption(buildEchartsOption({ xColumn: "slot" }, [query]), {
        replaceMerge: ["series"],
      })
      expect(chart.renderToSVGString()).not.toContain("Reading limit")
      expect(chart.getOption().yAxis).toMatchObject([{ max: undefined }])
    } finally {
      chart.dispose()
    }
  })

  it("does not draw a cell for a null measurement on a constant scale", () => {
    // Given
    const option = buildEchartsOption({ xColumn: "slot" }, [
      {
        index: 0,
        type: "heatmap",
        axis: "left",
        xColumn: "slot",
        partitionByColumn: "station",
        yColumns: ["reading"],
        columns: [
          { name: "slot", type: "INT" },
          { name: "station", type: "SYMBOL" },
          { name: "reading", type: "DOUBLE" },
        ],
        dataset: [
          [1, "A", 12],
          [2, "A", null],
        ],
      },
    ])
    const chart = createChart()
    try {
      const [series] = option.series as CustomSeriesOption[]
      const renderCell = series.renderItem
      const rendered: unknown[] = []
      series.renderItem = (params, api) => {
        const cell = renderCell?.(params, api)
        rendered.push(cell)
        return cell
      }

      // When
      chart.setOption(option)

      // Then
      expect(rendered).toEqual([
        expect.objectContaining({ type: "rect" }),
        null,
      ])
    } finally {
      chart.dispose()
    }
  })

  it("renders distinct X positions with exact DECIMAL category labels", () => {
    const chart = createChart()
    const xValues = ["1234.123456789012345678", "1234.123456789012345679"]
    try {
      chart.setOption(
        buildEchartsOption({ xColumn: "slot" }, [
          {
            index: 0,
            type: "bar",
            axis: "left",
            xColumn: "slot",
            yColumns: ["reading"],
            columns: [
              { name: "slot", type: "DECIMAL(38,18)" },
              { name: "reading", type: "INT" },
            ],
            dataset: xValues.map((x, i) => [x, i + 1]),
          },
        ]),
      )
      const xOf = (x: string) => chart.convertToPixel({ xAxisIndex: 0 }, x)
      expect(xOf(xValues[1]) - xOf(xValues[0])).toBeGreaterThan(0)
      expect(chart.getOption().xAxis).toMatchObject([
        { type: "category", data: xValues },
      ])
    } finally {
      chart.dispose()
    }
  })

  it.each(["row", "chart"] as const)(
    "draws all finite DOUBLE extremes with distinct colors (%s scale)",
    (colorScale) => {
      const readings = [-1e308, 0, 9e307, 1e308]
      const option = buildEchartsOption({ xColumn: "slot" }, [
        {
          index: 0,
          type: "heatmap",
          axis: "left",
          xColumn: "slot",
          partitionByColumn: "station",
          yColumns: ["reading"],
          colorScale,
          columns: [
            { name: "slot", type: "INT" },
            { name: "station", type: "SYMBOL" },
            { name: "reading", type: "DOUBLE" },
          ],
          dataset: readings.map((value, i) => [i, "west", value]),
        },
      ])
      const [series] = option.series as CustomSeriesOption[]
      expect(series.data).toEqual(
        readings.map((value, i) => [i, 0, [0, 0.5, 0.95, 1][i], value]),
      )
      const render = series.renderItem
      const colors: unknown[] = []
      series.renderItem = (params, api) => {
        const cell = render?.(params, api)
        expect(cell).toMatchObject({ type: "rect" })
        colors.push(api.visual("color"))
        return cell
      }
      const chart = createChart()
      try {
        chart.setOption(option)
        expect(new Set(colors).size).toBe(readings.length)
      } finally {
        chart.dispose()
      }
    },
  )

  it("fits long signed DECIMAL scale labels at narrow widths and restores exact labels on resize", () => {
    const low = "-1234567890123456789012345678.123456789012345678"
    const high = "9876543210987654321098765432.987654321098765432"
    const option = buildEchartsOption({ xColumn: "slot" }, [
      {
        index: 0,
        type: "heatmap",
        axis: "left",
        xColumn: "slot",
        partitionByColumn: "station",
        yColumns: ["reading"],
        columns: [
          { name: "slot", type: "INT" },
          { name: "station", type: "SYMBOL" },
          { name: "reading", type: "DECIMAL(46,18)" },
        ],
        dataset: [
          [1, "west", low],
          [2, "west", high],
        ],
      },
    ])
    const chart = createChart(400, 320)
    try {
      for (const [width, endpoints] of [
        [320, ["9.876…e27", "-1.234…e27"]],
        [800, [high, low]],
      ] as const) {
        chart.resize({ width })
        const fitted = withFittedHeatmapLegend(option, width)
        expect(fitted.visualMap).toMatchObject({ text: endpoints, show: true })
        chart.setOption({ ...fitted, animation: false })
        const list = chart.getZr().storage.getDisplayList(true)
        for (const endpoint of endpoints) {
          const label = list.find(
            (el) => (el.style as { text?: string }).text === endpoint,
          )
          expect(label).toBeDefined()
          const bounds = label!.getBoundingRect().clone()
          bounds.applyTransform(label!.getComputedTransform())
          expect(bounds.x).toBeGreaterThanOrEqual(0)
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
        }
        const tooltip = fitted.tooltip as { formatter: (p: unknown) => string }
        expect(tooltip.formatter({ value: [0, 0, 0, low] })).toContain(
          `Scale: ${low} to ${high}`,
        )
      }
    } finally {
      chart.dispose()
    }
  })

  const longRowLabel =
    "us-east-1-production-payments-reconciliation-worker-settlements".repeat(3)
  it.each([
    ["worker", 21, false],
    [longRowLabel, 21, false],
    [longRowLabel, 90, true],
    [longRowLabel, 2, false],
  ] as const)(
    "uses rendered heatmap column density with row label %s and %i columns",
    (rowLabel, slots, crowded) => {
      const width = 480
      const height = 300
      const chart = createChart(height, width)
      const option = buildEchartsOption({ xColumn: "slot" }, [
        {
          index: 0,
          type: "heatmap",
          axis: "left",
          xColumn: "slot",
          partitionByColumn: "station",
          yColumns: ["reading"],
          columns: [
            { name: "slot", type: "INT" },
            { name: "station", type: "SYMBOL" },
            { name: "reading", type: "DOUBLE" },
          ],
          dataset: Array.from({ length: slots }, (_, i) => [i, rowLabel, i]),
        },
      ])
      try {
        const bounded = withBoundedHeatmapLabels(option, width)
        chart.setOption({
          ...withZoomDensity(bounded, chartZoomDensity(bounded, width, height)),
          animation: false,
        })
        expect(chart.getOption().yAxis).toMatchObject([{ data: [rowLabel] }])
        const svg = chart.renderToSVGString()
        expect(svg.includes(rowLabel)).toBe(rowLabel !== longRowLabel)
        if (rowLabel === longRowLabel) expect(svg).toContain("…")
        const tooltip = bounded.tooltip as { formatter: (p: unknown) => string }
        expect(tooltip.formatter({ value: [0, 0, 0, 0] })).toContain(rowLabel)
        const xOf = (x: number) => chart.convertToPixel({ xAxisIndex: 0 }, x)
        const pitch = xOf(1) - xOf(0)
        expect(pitch).toBeGreaterThan(0)
        expect(pitch < 6).toBe(crowded)
        expect(chart.getOption().dataZoom).toMatchObject([
          { id: X_WHEEL_ZOOM_ID, disabled: pitch >= 18 },
          { id: X_SLIDER_ZOOM_ID, show: crowded },
          { id: Y_SLIDER_ZOOM_ID, show: false },
        ])
        if (crowded) {
          chart.dispatchAction({
            type: "dataZoom",
            dataZoomId: X_SLIDER_ZOOM_ID,
            start: 0,
            end: 30,
          })
          expect(xOf(1) - xOf(0)).toBeGreaterThan(pitch)
        }
      } finally {
        chart.dispose()
      }
    },
  )

  it.each([2, 100])(
    "uses a row slider to enlarge dense heatmap cells without moving the %i-slot X axis",
    (xSlots) => {
      const height = 350
      const width = 640
      const rowCount = 500
      const option = buildEchartsOption({ xColumn: "slot" }, [
        {
          index: 0,
          type: "heatmap",
          axis: "left",
          xColumn: "slot",
          partitionByColumn: "station",
          yColumns: ["reading"],
          columns: [
            { name: "slot", type: "INT" },
            { name: "station", type: "SYMBOL" },
            { name: "reading", type: "DOUBLE" },
          ],
          dataset: Array.from({ length: rowCount }, (_, i) => [
            i % xSlots,
            `station ${String(i).padStart(3, "0")}`,
            i,
          ]),
        },
      ])
      const density = chartZoomDensity(option, width, height)
      expect(density).toEqual({
        rowSlider: true,
        wheel: xSlots === 100,
        slider: xSlots === 100,
      })
      expect(chartZoomDensity(option, width, 2400).rowSlider).toBe(false)
      const chart = createChart(height)
      try {
        chart.setOption({
          ...withZoomDensity(option, density),
          animation: false,
        })
        const xOf = (x: number) => chart.convertToPixel({ xAxisIndex: 0 }, x)
        const rowHeight = () =>
          Math.abs(
            chart.convertToPixel({ yAxisIndex: 0 }, 1) -
              chart.convertToPixel({ yAxisIndex: 0 }, 0),
          )
        const initialRowHeight = rowHeight()
        const xBefore = [xOf(0), xOf(1)]
        expect(initialRowHeight).toBeGreaterThan(0)
        expect(initialRowHeight).toBeLessThan(1)
        expect(chart.getOption().dataZoom).toMatchObject([
          { id: X_WHEEL_ZOOM_ID, disabled: xSlots === 2, xAxisIndex: 0 },
          { id: X_SLIDER_ZOOM_ID, show: xSlots === 100, xAxisIndex: 0 },
          {
            id: Y_SLIDER_ZOOM_ID,
            show: true,
            yAxisIndex: 0,
            orient: "vertical",
          },
        ])
        chart.dispatchAction({
          type: "dataZoom",
          dataZoomId: Y_SLIDER_ZOOM_ID,
          start: 0,
          end: 2,
        })
        expect(rowHeight()).toBeGreaterThan(10)
        expect([xOf(0), xOf(1)]).toEqual(xBefore)
        expect(chart.renderToSVGString()).toContain("station 001")

        if (xSlots === 100) {
          const zoomedRowHeight = rowHeight()
          chart.dispatchAction({
            type: "dataZoom",
            dataZoomId: X_WHEEL_ZOOM_ID,
            start: 0,
            end: 50,
          })
          expect(xOf(1) - xOf(0)).toBeGreaterThan(xBefore[1] - xBefore[0])
          expect(rowHeight()).toEqual(zoomedRowHeight)
        }
      } finally {
        chart.dispose()
      }
    },
  )
})
