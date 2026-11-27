import { describe, expect, it } from "vitest"
import { init } from "echarts"
import {
  buildEchartsOption,
  type ResolvedQuery,
} from "../../../src/scenes/Editor/Notebook/CellChart/buildEchartsOption"

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
})
