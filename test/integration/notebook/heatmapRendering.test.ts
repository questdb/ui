import { describe, expect, it } from "vitest"
import { init, type CustomSeriesOption } from "echarts"
import { buildEchartsOption } from "../../../src/scenes/Editor/Notebook/CellChart/buildEchartsOption"

describe("notebook heatmap rendering", () => {
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
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 640,
      height: 400,
    })
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
