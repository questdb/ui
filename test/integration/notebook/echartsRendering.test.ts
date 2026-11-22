import { describe, expect, it } from "vitest"
import { init, type CustomSeriesOption } from "echarts"
import {
  buildEchartsOption,
  withZoomDensity,
  type ResolvedQuery,
} from "../../../src/scenes/Editor/Notebook/CellChart/buildEchartsOption"

import {
  chartZoomDensity,
  X_SLIDER_ZOOM_ID,
  X_WHEEL_ZOOM_ID,
  Y_SLIDER_ZOOM_ID,
} from "../../../src/scenes/Editor/Notebook/CellChart/chartDensity"

const createChart = (height = 400) =>
  init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 640,
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
