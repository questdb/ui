// @vitest-environment node
import { afterEach, expect, it } from "vitest"
import type { EChartsOption } from "echarts"
import { echarts } from "./echartsSetup"
import { bindChartZoom } from "./chartZoomBinding"
import { withViewState } from "./zoomWindow"
import {
  chartRoam,
  chartRoamResets,
  chartZoomed,
  clearChartZoom,
  resetChartZoom,
} from "../cellVirtualization/chartZoomStore"
import { DEFAULT_ZOOM } from "./zoomWindow"

const scope = { bufferId: 91, cellId: "graph" }

afterEach(() => clearChartZoom(scope))

const option: EChartsOption = {
  series: [
    {
      type: "graph",
      layout: "none",
      roam: true,
      data: [
        { name: "a", x: 0, y: 0 },
        { name: "b", x: 10, y: 10 },
      ],
      links: [{ source: "a", target: "b" }],
    },
  ],
}

const draw = () => {
  const chart = echarts.init(null as unknown as HTMLElement, undefined, {
    renderer: "svg",
    ssr: true,
    width: 400,
    height: 300,
  })
  const drawn = () =>
    withViewState(option, () => DEFAULT_ZOOM, undefined, chartRoam(scope))
      .option
  chart.setOption(drawn(), { notMerge: true })
  const binding = bindChartZoom(chart, scope, () => option)
  return { chart, drawn, binding }
}

it("keeps a panned and zoomed graph through a full redraw, until Reset", () => {
  // Given a roaming graph the user zoomed in
  const { chart, drawn, binding } = draw()
  try {
    chart.dispatchAction({
      type: "graphRoam",
      seriesIndex: 0,
      zoom: 2,
      originX: 200,
      originY: 150,
    })
    expect(chartRoam(scope)?.["series.0"]?.zoom).toBe(2)
    expect(chartZoomed(scope)).toBe(true)

    // When a refresh redraws it with the whole option replaced
    chart.setOption(drawn(), { notMerge: true })

    // Then it is still zoomed in
    const series = (chart.getOption().series as { zoom?: number }[])[0]
    expect(series.zoom).toBe(2)

    // And Reset forgets it, so the next draw is the option's own view
    const resets = chartRoamResets(scope)
    resetChartZoom(scope)
    expect(chartRoam(scope)).toBeUndefined()
    expect(chartRoamResets(scope)).toBe(resets + 1)
    expect(chartZoomed(scope)).toBe(false)
    chart.setOption(drawn(), { notMerge: true })
    expect((chart.getOption().series as { zoom?: number }[])[0].zoom).toBe(1)
  } finally {
    binding.dispose()
    chart.dispose()
  }
})

it("writes a roam into the matching series or geo of the option only", () => {
  // Given / When
  const { option: next } = withViewState(
    { series: [{ type: "map" }], geo: { map: "world" } } as EChartsOption,
    () => DEFAULT_ZOOM,
    undefined,
    { "geo.0": { center: [1, 2], zoom: 3 }, "series.4": { zoom: 9 } },
  )

  // Then
  expect(next).toEqual({
    series: [{ type: "map" }],
    geo: { map: "world", center: [1, 2], zoom: 3 },
  })
})
