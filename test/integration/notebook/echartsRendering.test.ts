import { describe, expect, it } from "vitest"
import { init, type CustomSeriesOption } from "echarts"
import {
  buildEchartsOption,
  type ResolvedQuery,
} from "../../../src/scenes/Editor/Notebook/CellChart/buildEchartsOption"

const createChart = () =>
  init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 640,
    height: 400,
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
      chart.setOption(buildEchartsOption({ xColumn: "slot" }, [query]))

      // Then the merged chart drops the old line and scaling bound
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
})
