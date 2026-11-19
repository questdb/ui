import { describe, expect, it } from "vitest"
import type { EChartsOption } from "echarts"
import { chartZoomDensity } from "./chartDensity"

const rangeBars = (count: number, horizontal: boolean): EChartsOption => ({
  xAxis: { type: horizontal ? "time" : "category" },
  yAxis: { type: horizontal ? "category" : "value" },
  series: [
    {
      type: "custom",
      renderItem: "barRange",
      encode: horizontal ? { y: 0, x: [1, 2] } : { x: 0, y: [1, 2] },
      data: Array.from({ length: count }, (_, i) => [i, 1, 2]),
    },
  ] as EChartsOption["series"],
})

describe("chartZoomDensity", () => {
  it("treats crowded range bars standing on x like bars", () => {
    // Given 400 range bars in a 600 px wide chart
    const option = rangeBars(400, false)

    // When
    const density = chartZoomDensity(option, 600)

    // Then
    expect(density).toEqual({ slider: true, wheel: true })
  })

  it("does not count the rows of a timeline, which zooms on its own", () => {
    // Given 400 lanes lying along a time axis, with the timeline's own zoom
    const option = {
      ...rangeBars(400, true),
      dataZoom: [{ type: "inside" }],
    } as EChartsOption

    // When
    const density = chartZoomDensity(option, 600)

    // Then no slider, and the wheel stays armed
    expect(density).toEqual({ slider: false, wheel: true })
  })
})
