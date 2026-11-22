// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import {
  buildEchartsOption,
  withZoomDensity,
} from "../CellChart/buildEchartsOption"
import { echarts } from "../CellChart/echartsSetup"
import { primaryXControls } from "../CellChart/liveZoom"
import { zoomWindowForEvent, type DataZoomEvent } from "../CellChart/zoomWindow"
import { resolveDraw, toChartResult } from "../DrawCanvas/drawCanvasUtils"
import { joinChartSync, setChartSync } from "./chartSync"

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
}[] = []
const leaves: (() => void)[] = []
afterEach(() => {
  leaves.splice(0).forEach((l) => l())
  mounted.splice(0).forEach(({ instance, host }) => {
    instance.dispose()
    host.remove()
  })
  setChartSync(9, undefined)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

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

const mount = (
  metric: string,
  from: number,
  to: number,
  handlerAfterSync = false,
) => {
  const host = document.createElement("div")
  document.body.append(host)
  const instance = echarts.init(host, undefined, {
    renderer: "canvas",
    width: 640,
    height: 300,
  })
  mounted.push({ instance, host })
  // echarts-for-react first render: setOption(option, notMerge=false, lazyUpdate=true)
  instance.setOption(optionFor(metric, from, to), false, false)
  const persisted: unknown[] = []
  // ChartRenderer's datazoom handler -> onZoomChange (what the store keeps).
  // echarts-for-react binds it before chart sync joins, and binds it again
  // after sync when the cell's interactions change.
  const persist = () =>
    instance.on("datazoom", (evt) => {
      persisted.push(zoomWindowForEvent(evt as DataZoomEvent, instance))
    })
  if (!handlerAfterSync) persist()
  leaves.push(joinChartSync(9, instance))
  if (handlerAfterSync) persist()
  return { instance, host, persisted }
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

  // Refresh tick: every chart's query re-runs and the new rows merge into the
  // same instance (stable structural key; notMerge=false).
  source.instance.setOption(
    optionFor("cpu", refreshFrom, refreshTo),
    false,
    false,
  )
  peerA.instance.setOption(
    optionFor("mem", refreshFrom, refreshTo),
    false,
    false,
  )
  peerB.instance.setOption(
    optionFor("disk", refreshFrom, refreshTo),
    false,
    false,
  )
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
    // And the zoomed chart remembers the same absolute window as its peers
    expect(source.persisted.at(-1)).toHaveProperty("bounds")
  },
)

it("keeps the zoomed chart's absolute window when its zoom handler runs after chart sync", () => {
  vi.useFakeTimers()
  stubCanvas()
  setChartSync(9, { crosshair: "off", zoom: true })
  // Given a linked chart whose zoom handler was bound again after it joined
  // chart sync (a saved click interaction rebinds the chart's events)
  const source = mount("cpu", 0, 60, true)
  const peer = mount("mem", 0, 60)

  // When the user zooms it to the middle half
  const inside = primaryXControls(source.instance).find(
    (c) => (c as unknown as { type: string }).type === "dataZoom.inside",
  )!
  source.instance.dispatchAction({
    type: "dataZoom",
    batch: [{ dataZoomId: inside.id, start: 25, end: 75 }],
  })
  vi.advanceTimersByTime(500)

  // Then it remembers the same absolute window as its peer, so a remount
  // after a refresh restores the times the peer shows
  const [startValue, endValue] = primaryXControls(
    peer.instance,
  )[0].getValueRange("x", 0)!
  expect(source.persisted.at(-1)).toMatchObject({
    bounds: { startValue, endValue },
  })
})
