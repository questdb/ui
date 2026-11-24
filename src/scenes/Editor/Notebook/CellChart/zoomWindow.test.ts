import type { EChartsOption } from "echarts"
import { describe, expect, it } from "vitest"
import { echarts } from "./echartsSetup"
import { zoomControls } from "./liveZoom"
import {
  controlKeyOf,
  withViewState,
  zoomAxesOf,
  zoomKeyOf,
  type ZoomState,
} from "./zoomWindow"

const line = { type: "line" as const, data: [[0, 1]] }

// Zoom controls as authors write them: the key read from the option before
// drawing must be the key ECharts gives the drawn control, or a window would
// be written into one control and read back from another.
const OPTIONS: [string, Record<string, unknown>][] = [
  [
    "implicit x and a vertical slider",
    {
      xAxis: { type: "time" },
      yAxis: { type: "value" },
      dataZoom: [{ type: "inside" }, { type: "slider", orient: "vertical" }],
      series: [line],
    },
  ],
  [
    "axes named by index, list, id, all and none",
    {
      xAxis: [{ type: "value" }, { type: "value", id: "second" }],
      yAxis: [{ type: "value" }, { type: "value" }],
      dataZoom: [
        { type: "inside", yAxisIndex: [1, 0] },
        { type: "slider", xAxisId: "second" },
        { type: "inside", xAxisIndex: "all" },
        { type: "inside", xAxisIndex: "none", yAxisIndex: 1 },
      ],
      series: [line],
    },
  ],
  [
    "a category y axis and no x axis to parallel",
    {
      yAxis: { type: "category", data: ["a", "b"] },
      xAxis: { type: "value" },
      dataZoom: { type: "slider", orient: "vertical" },
      series: [{ type: "bar", data: [1, 2] }],
    },
  ],
  [
    "a single axis",
    {
      singleAxis: [{ type: "value", orient: "horizontal" }],
      dataZoom: [{ type: "inside" }],
      series: [
        { type: "scatter", coordinateSystem: "singleAxis", data: [1, 2] },
      ],
    },
  ],
  [
    "a polar chart",
    {
      polar: {},
      angleAxis: { type: "category", data: ["a", "b"] },
      radiusAxis: {},
      dataZoom: [{ type: "inside" }, { type: "slider", radiusAxisIndex: 0 }],
      series: [{ type: "bar", coordinateSystem: "polar", data: [1, 2] }],
    },
  ],
]

describe("zoom keys", () => {
  it.each(OPTIONS)(
    "reads the axis ECharts zooms from the option: %s",
    (_, option) => {
      const chart = echarts.init(null, undefined, {
        renderer: "svg",
        ssr: true,
        width: 600,
        height: 400,
      })
      try {
        chart.setOption(option)
        const entries = Array.isArray(option.dataZoom)
          ? (option.dataZoom as Record<string, unknown>[])
          : [option.dataZoom as Record<string, unknown>]
        expect(entries.map((entry) => zoomKeyOf(option, entry))).toEqual(
          zoomControls(chart).map(controlKeyOf),
        )
      } finally {
        chart.dispose()
      }
    },
  )
})

describe("view state written into an option", () => {
  const option: EChartsOption = {
    xAxis: { type: "time" },
    yAxis: { type: "category", data: ["a", "b"] },
    legend: [{}, { selected: { Bid: true } }],
    dataZoom: [
      { type: "inside", start: 50, end: 100 },
      { type: "slider", startValue: 5 },
      { type: "inside", yAxisIndex: 0 },
    ],
    series: [line],
  }
  const states: Record<string, ZoomState> = {
    x0: { mode: "pinned", from: 10, to: 20, axis: "time" },
    y0: { mode: "pinned-pct", start: 0, end: 50 },
  }

  it("writes each control's window, replacing the authored one", () => {
    const view = withViewState(option, (key) => states[key], undefined)
    expect(view.option.dataZoom).toEqual([
      { type: "inside", startValue: 10, endValue: 20 },
      { type: "slider", startValue: 10, endValue: 20 },
      { type: "inside", yAxisIndex: 0, start: 0, end: 50 },
    ])
    expect([...view.states.keys()]).toEqual(["x0", "y0"])
    expect(zoomAxesOf(option)).toEqual({
      time: true,
      axes: { x0: "time", y0: "category" },
    })
  })

  it("keeps the authored window of a control in its default state", () => {
    const view = withViewState(option, () => ({ mode: "default" }), undefined)
    expect(view.option.dataZoom).toEqual(option.dataZoom)
  })

  it("hides the series the user hid in every legend", () => {
    const view = withViewState(option, () => ({ mode: "default" }), {
      Ask: false,
    })
    expect(view.option.legend).toEqual([
      { selected: { Ask: false } },
      { selected: { Bid: true, Ask: false } },
    ])
  })
})
