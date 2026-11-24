// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import {
  buildEchartsOption,
  withZoomDensity,
} from "../CellChart/buildEchartsOption"
import { echarts } from "../CellChart/echartsSetup"
import { primaryXControls } from "../CellChart/liveZoom"
import {
  bindChartZoom,
  type ChartZoomBinding,
} from "../CellChart/chartZoomBinding"
import { withViewState, zoomAxesOf } from "../CellChart/zoomWindow"
import {
  chartZoomState,
  clearNotebookChartZooms,
  setChartZoomAxes,
  type ZoomScope,
} from "../cellVirtualization/chartZoomStore"
import { resolveDraw, toChartResult } from "../DrawCanvas/drawCanvasUtils"
import { setChartSync } from "./chartSync"

const MIN = 60_000
const T0 = Date.parse("2026-01-01T00:00:00.000Z")
const iso = (m: number) => new Date(T0 + m * MIN).toISOString()

// The option DrawCanvas hands ChartRenderer for `select ts, <metric>`.
const optionFor = (metric: string, fromMin: number, toMin: number) => {
  const query = `select ts, ${metric} from metrics`
  const dataset: unknown[][] = []
  for (let m = fromMin; m <= toMin; m++) dataset.push([iso(m), m % 7])
  const options = toChartResult(
    {
      activeResultIndex: 0,
      timestamp: 1,
      results: [
        {
          type: "dql",
          query,
          columns: [
            { name: "ts", type: "TIMESTAMP" },
            { name: metric, type: "DOUBLE" },
          ],
          dataset,
          count: dataset.length,
          timestamp: 0,
        },
      ],
    } as never,
    [query],
  )
  if (options.kind !== "settled") throw new Error(options.kind)
  const resolution = resolveDraw([query], options.results, undefined)
  const option = withZoomDensity(
    buildEchartsOption(resolution.chart, resolution.renderQueries, {}),
    { wheel: true, slider: true },
  )
  // ChartRenderer's renderOption adds `animation`.
  return { ...option, animation: false }
}

const mounted: {
  instance: ReturnType<typeof echarts.init>
  host: HTMLElement
  binding: ChartZoomBinding
}[] = []
afterEach(() => {
  mounted.splice(0).forEach(({ instance, host, binding }) => {
    binding.dispose()
    instance.dispose()
    host.remove()
  })
  setChartSync(9, undefined)
  clearNotebookChartZooms(9)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// What ChartRenderer does on each draw: the option with the store's windows
// written in, replacing the instance's whole option.
const draw = (
  instance: ReturnType<typeof echarts.init>,
  scope: ZoomScope,
  option: ReturnType<typeof optionFor>,
  binding?: ChartZoomBinding,
) => {
  const axes = zoomAxesOf(option)
  setChartZoomAxes(scope, axes)
  const view = withViewState(
    option,
    (key) => chartZoomState(scope, key, axes),
    undefined,
  )
  instance.setOption(view.option, { notMerge: true })
  binding?.drew(view.states)
  return view.states
}

const stubCanvas = () =>
  vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(function (this: HTMLCanvasElement) {
      return new Proxy(
        { canvas: this, measureText: (s: string) => ({ width: s.length * 7 }) },
        {
          get: (target, key): unknown =>
            (Reflect.get(target, key) as unknown) ?? (() => undefined),
        },
      ) as unknown as CanvasRenderingContext2D
    } as unknown as typeof HTMLCanvasElement.prototype.getContext)

const mount = (metric: string, from: number, to: number) => {
  const host = document.createElement("div")
  document.body.append(host)
  const instance = echarts.init(host, undefined, {
    renderer: "canvas",
    width: 640,
    height: 300,
  })
  const scope = { bufferId: 9, cellId: metric }
  const option = optionFor(metric, from, to)
  const states = draw(instance, scope, option)
  let drawn = option
  const binding = bindChartZoom(instance, scope, () => drawn)
  binding.drew(states)
  mounted.push({ instance, host, binding })
  const refresh = (refreshFrom: number, refreshTo: number) => {
    drawn = optionFor(metric, refreshFrom, refreshTo)
    draw(instance, scope, drawn, binding)
  }
  return { instance, host, scope, refresh }
}

const xRange = (instance: ReturnType<typeof echarts.init>) => {
  const [control] = primaryXControls(instance)
  const range = control?.getValueRange("x", 0)
  if (!range) throw new Error("no time zoom")
  return range.map((at) => new Date(at).toISOString())
}

const axisExtent = (instance: ReturnType<typeof echarts.init>) => {
  const model = (
    instance as unknown as {
      getModel(): {
        getComponent(
          t: string,
          i: number,
        ): { axis: { scale: { getExtent(): [number, number] } } }
      }
    }
  ).getModel()
  const e = model.getComponent("xAxis", 0).axis.scale.getExtent()
  return [new Date(e[0]).toISOString(), new Date(e[1]).toISOString()]
}

const scenario = (refreshFrom: number, refreshTo: number) => {
  vi.useFakeTimers()
  stubCanvas()
  setChartSync(9, { crosshair: "off", zoom: true })
  const source = mount("cpu", 0, 60)
  const peerA = mount("mem", 0, 60)
  const peerB = mount("disk", 0, 60)

  // User wheel-zooms the source chart (ECharts' inside zoom dispatches a
  // batch of percentage windows: roams.js dispatchAction).
  const inside = primaryXControls(source.instance).find(
    (c) => (c as unknown as { type: string }).type === "dataZoom.inside",
  )!
  source.instance.dispatchAction({
    type: "dataZoom",
    batch: [{ dataZoomId: inside.id, start: 25, end: 75 }],
  })
  vi.advanceTimersByTime(500)

  const before = {
    source: xRange(source.instance),
    peerA: xRange(peerA.instance),
    peerB: xRange(peerB.instance),
  }
  expect(before.peerA).toEqual(before.source)
  expect(before.peerB).toEqual(before.source)

  // Refresh tick: every chart's query re-runs and each chart is drawn again
  // in full, with the windows the zoom store holds.
  source.refresh(refreshFrom, refreshTo)
  peerA.refresh(refreshFrom, refreshTo)
  peerB.refresh(refreshFrom, refreshTo)
  vi.advanceTimersByTime(500)

  const after = {
    source: xRange(source.instance),
    peerA: xRange(peerA.instance),
    peerB: xRange(peerB.instance),
    sourceAxis: axisExtent(source.instance),
    peerAAxis: axisExtent(peerA.instance),
  }
  return { before, after, source }
}

it.each([
  ["new rows extend the time range", 0, 90, true],
  ["the time range slides past the window's start", 30, 90, false],
] as const)(
  "keeps linked charts on the zoomed times after a refresh where %s",
  (_, from, to, windowInRange) => {
    // Given three linked time charts, one zoomed to the middle half
    const { before, after, source } = scenario(from, to)
    expect(before.peerA).toEqual(before.source)

    // Then every chart still shows the same absolute window after the refresh
    if (windowInRange) expect(after.source).toEqual(before.source)
    expect(after.peerA).toEqual(after.source)
    expect(after.peerB).toEqual(after.source)
    // And the store keeps the absolute window the charts share
    expect(chartZoomState(source.scope, "x0")).toMatchObject({
      mode: "pinned",
    })
  },
)

it("keeps an unlinked zoom on its times while the data grows", () => {
  vi.useFakeTimers()
  stubCanvas()
  // Given an unlinked time chart zoomed to the middle half
  const chart = mount("cpu", 0, 60)
  const [control] = primaryXControls(chart.instance)
  chart.instance.dispatchAction({
    type: "dataZoom",
    dataZoomId: control.id,
    start: 25,
    end: 75,
  })
  const before = xRange(chart.instance)

  // When new rows arrive, then it still shows the same times
  chart.refresh(0, 90)
  expect(xRange(chart.instance)).toEqual(before)

  // And zoomed out to all its data, it follows the next rows
  chart.instance.dispatchAction({
    type: "dataZoom",
    dataZoomId: control.id,
    start: 0,
    end: 100,
  })
  chart.refresh(0, 120)
  expect(xRange(chart.instance)).toEqual([iso(0), iso(120)])
})
