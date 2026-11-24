import type { EChartsType } from "echarts"
import { afterEach, describe, expect, it, vi } from "vitest"
import { joinChartSync, setChartSync } from "./chartSync"
import {
  chartZoomed,
  clearNotebookChartZooms,
  setChartZoomAxes,
  subscribeChartZoom,
} from "../cellVirtualization/chartZoomStore"
import { bindChartZoom } from "../CellChart/chartZoomBinding"
import { echarts } from "../CellChart/echartsSetup"
import { zoomAxesOf } from "../CellChart/zoomWindow"

type Handler = (payload?: unknown) => void

const makeChart = (type = "time") => {
  const handlers = new Map<string, Handler>()
  const emit = (event: string, payload?: unknown) =>
    handlers.get(event)?.(payload)
  const chart = {
    getModel: () => ({
      getComponent: () => ({ get: () => type }),
      queryComponents: () => [
        { componentIndex: 0, getAxisModel: () => undefined },
        {
          componentIndex: 1,
          getAxisModel: () => ({}),
          getValueRange: () => [0, 1000],
        },
      ],
    }),
    getOption: vi.fn(() => ({
      xAxis: [{ type }],
      dataZoom: [
        { startValue: 50, endValue: 100, yAxisIndex: 0 },
        { startValue: 0, endValue: 1_000, xAxisIndex: 0 },
      ],
    })),
    getHeight: vi.fn(() => 200),
    convertToPixel: vi.fn(() => 42),
    isDisposed: vi.fn(() => false),
    on: vi.fn((event: string, handler: Handler) =>
      handlers.set(event, handler),
    ),
    off: vi.fn((event: string, handler: Handler) => {
      if (handlers.get(event) === handler) handlers.delete(event)
    }),
    dispatchAction: vi.fn<[Record<string, unknown>], void>(),
  }
  return { ...chart, instance: chart as unknown as EChartsType, emit }
}

const cleanups: (() => void)[] = []
const join = (bufferId: number, chart: ReturnType<typeof makeChart>) => {
  const leave = joinChartSync(bufferId, chart.instance)
  cleanups.push(leave)
  return leave
}

afterEach(() => {
  cleanups.splice(0).forEach((leave) => leave())
  setChartSync(1, undefined)
  setChartSync(2, undefined)
})

const move = {
  axesInfo: [
    { axisDim: "y", axisIndex: 0, value: 11 },
    { axisDim: "x", axisIndex: 0, value: 87 },
  ],
}

describe("notebook chart sync", () => {
  it("projects the time into each peer's pixels and changes modes without rejoining", () => {
    const source = makeChart()
    const peer = makeChart()
    const category = makeChart("category")
    const disposed = makeChart()
    const otherNotebook = makeChart()
    disposed.isDisposed.mockReturnValue(true)
    for (const chart of [source, peer, category, disposed]) join(1, chart)
    join(2, otherNotebook)

    source.emit("updateAxisPointer", move)
    expect(source.getOption).not.toHaveBeenCalled()
    expect(peer.dispatchAction).not.toHaveBeenCalled()

    setChartSync(1, { crosshair: "line", zoom: false })
    source.emit("updateAxisPointer", move)
    expect(peer.convertToPixel).toHaveBeenCalledWith({ xAxisIndex: 0 }, 87)
    expect(peer.dispatchAction).toHaveBeenLastCalledWith({
      type: "updateAxisPointer",
      currTrigger: "mousemove",
      x: 42,
      y: 100,
      tooltipOption: { showContent: false },
    })
    for (const chart of [source, category, disposed, otherNotebook]) {
      expect(chart.dispatchAction).not.toHaveBeenCalled()
    }

    setChartSync(1, { crosshair: "tooltip", zoom: false })
    source.emit("updateAxisPointer", move)
    expect(peer.dispatchAction).toHaveBeenLastCalledWith({
      type: "showTip",
      x: 42,
      y: 100,
    })
    source.emit("updateAxisPointer", { axesInfo: [] })
    expect(peer.dispatchAction.mock.calls.slice(-2)).toEqual([
      [{ type: "hideTip" }],
      [{ type: "updateAxisPointer", currTrigger: "leave" }],
    ])
  })

  it("ignores category indices, secondary axes and exits while sync is off", () => {
    // Given two time charts and a categorical chart
    const category = makeChart("category")
    const source = makeChart()
    const peer = makeChart()
    for (const chart of [category, source, peer]) join(1, chart)

    // When a non-time axis generates a pointer update or the pointer exits
    setChartSync(1, { crosshair: "line", zoom: false })
    category.emit("updateAxisPointer", move)
    category.emit("globalout")
    source.emit("updateAxisPointer", {
      axesInfo: [{ axisDim: "x", axisIndex: 1, value: 87 }],
    })
    setChartSync(1, { crosshair: "off", zoom: false })
    source.emit("globalout")

    // Then the time peer does not receive a pointer or cleanup action
    expect(peer.dispatchAction).not.toHaveBeenCalled()
  })

  it("leaves zooming to the zoom store", () => {
    // Given two linked time charts joined to chart sync
    const source = makeChart()
    const peer = makeChart()
    setChartSync(1, { crosshair: "off", zoom: true })
    join(1, source)
    join(1, peer)

    // When the source reports a zoom, chart sync does not move the peer
    source.emit("datazoom", { dataZoomIndex: 1, start: 20, end: 80 })
    expect(peer.dispatchAction).not.toHaveBeenCalled()
    expect(source.on.mock.calls.map(([event]) => event)).not.toContain(
      "datazoom",
    )
  })
})

// Zooming time charts together: each chart is bound to the zoom store as
// ChartRenderer binds it, and the store carries a zoom to its peers.
describe("linked zoom", () => {
  const BUFFER = 3
  const TIME_OPTION = {
    xAxis: { type: "time", min: 0, max: 1000 },
    yAxis: { type: "value", min: 0, max: 100 },
    dataZoom: [
      { type: "slider", xAxisIndex: 0 },
      { type: "slider", yAxisIndex: 0 },
    ],
    series: [
      {
        type: "line",
        data: [
          [0, 5],
          [1000, 95],
        ],
      },
    ],
  }
  const charts: { instance: EChartsType; dispose: () => void }[] = []
  const bound = (cellId: string) => {
    const instance = echarts.init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 600,
      height: 400,
    })
    instance.setOption(TIME_OPTION)
    const scope = { bufferId: BUFFER, cellId }
    setChartZoomAxes(scope, zoomAxesOf(TIME_OPTION as never))
    const binding = bindChartZoom(instance, scope, () => TIME_OPTION as never)
    charts.push({
      instance,
      dispose: () => {
        binding.dispose()
        instance.dispose()
      },
    })
    return { instance, scope, binding }
  }
  type Model = {
    getComponent(type: "dataZoom", index: number): { id: string }
  }
  const zoomId = (instance: EChartsType, index: number) =>
    (instance as unknown as { getModel(): Model })
      .getModel()
      .getComponent("dataZoom", index).id
  const ranges = (instance: EChartsType) =>
    (
      instance.getOption() as {
        dataZoom: { start: number; end: number; startValue: number }[]
      }
    ).dataZoom

  afterEach(() => {
    charts.splice(0).forEach(({ dispose }) => dispose())
    setChartSync(BUFFER, undefined)
    clearNotebookChartZooms(BUFFER)
  })

  it("links generated time zoom IDs without linking generated Y zoom IDs", () => {
    // Given two linked time charts whose zoom controls have generated IDs
    setChartSync(BUFFER, { crosshair: "off", zoom: true })
    const source = bound("a").instance
    const peer = bound("b").instance
    const zoomOptions = source.getOption() as { dataZoom: { id?: string }[] }
    expect(zoomOptions.dataZoom.map(({ id }) => id)).toEqual([
      undefined,
      undefined,
    ])

    // When the user moves the source's Y control, the peer stays
    source.dispatchAction({
      type: "dataZoom",
      dataZoomId: zoomId(source, 1),
      start: 10,
      end: 90,
    })
    expect(ranges(peer)).toMatchObject([
      { start: 0, end: 100 },
      { start: 0, end: 100 },
    ])

    // When the user moves its X control, the peer shows the same times
    source.dispatchAction({
      type: "dataZoom",
      dataZoomId: zoomId(source, 0),
      start: 20,
      end: 80,
    })
    expect(ranges(peer)).toMatchObject([
      { startValue: 200, endValue: 800 },
      { start: 0, end: 100 },
    ])
  })

  it("forwards a full range as percentages, not a fixed time range", () => {
    setChartSync(BUFFER, { crosshair: "off", zoom: true })
    const source = bound("a").instance
    const peer = bound("b").instance
    const x = (instance: EChartsType, range: object) =>
      instance.dispatchAction({
        type: "dataZoom",
        dataZoomId: zoomId(instance, 0),
        ...range,
      })
    x(source, { start: 20, end: 80 })
    x(source, { start: 0, end: 100 })
    // A peer at 0–100% follows its data as new samples arrive
    const [peerX] = ranges(peer) as unknown as {
      start: number
      end: number
      startValue?: unknown
    }[]
    expect(peerX).toMatchObject({ start: 0, end: 100 })
    const model = (
      peer as unknown as {
        getModel(): {
          getComponent(
            type: "dataZoom",
            index: number,
          ): { getRangePropMode(): string[] }
        }
      }
    ).getModel()
    expect(model.getComponent("dataZoom", 0).getRangePropMode()).toEqual([
      "percent",
      "percent",
    ])
  })

  it("marks the peer zoomed, so its Reset zoom shows", () => {
    setChartSync(BUFFER, { crosshair: "off", zoom: true })
    const source = bound("a").instance
    const { scope } = bound("b")
    source.dispatchAction({
      type: "dataZoom",
      dataZoomId: zoomId(source, 0),
      startValue: 200,
      endValue: 800,
    })
    expect(chartZoomed(scope)).toBe(true)
  })

  it("copies a zoom only while linked, without echoing it, until unbound", () => {
    // Given two time charts, not linked
    const source = bound("a")
    const peer = bound("b")
    const x = (start: number, end: number) =>
      source.instance.dispatchAction({
        type: "dataZoom",
        dataZoomId: zoomId(source.instance, 0),
        start,
        end,
      })
    const peerHeard = vi.fn()
    const off = subscribeChartZoom(peer.scope, peerHeard)
    x(20, 80)
    expect(ranges(peer.instance)[0]).toMatchObject({ start: 0, end: 100 })
    expect(peerHeard).not.toHaveBeenCalled()

    // When they are linked, a zoom reaches the peer once, and the peer's
    // silent move is not written back as a gesture of its own
    setChartSync(BUFFER, { crosshair: "off", zoom: true })
    x(30, 70)
    expect(ranges(peer.instance)[0]).toMatchObject({
      startValue: 300,
      endValue: 700,
    })
    expect(peerHeard).toHaveBeenCalledTimes(1)

    // When the source is unbound (unmounted), its events write nothing
    source.binding.dispose()
    x(40, 60)
    expect(peerHeard).toHaveBeenCalledTimes(1)
    off()
  })
})
