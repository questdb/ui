import type { EChartsType } from "echarts"
import { afterEach, describe, expect, it, vi } from "vitest"
import { joinChartSync, setChartSync } from "./chartSync"

type Handler = (payload?: unknown) => void

const makeChart = (type = "time") => {
  const handlers = new Map<string, Handler>()
  const emit = (event: string, payload?: unknown) =>
    handlers.get(event)?.(payload)
  const chart = {
    getOption: vi.fn(() => ({
      xAxis: [{ type }],
      dataZoom: [{ startValue: 0, endValue: 1_000 }],
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
    expect(peer.dispatchAction).not.toHaveBeenCalled()

    setChartSync(1, { crosshair: "line", zoom: false })
    source.emit("updateAxisPointer", move)
    expect(peer.convertToPixel).toHaveBeenCalledWith({ xAxisIndex: 0 }, 87)
    expect(peer.dispatchAction).toHaveBeenLastCalledWith({
      type: "updateAxisPointer",
      currTrigger: "mousemove",
      x: 42,
      y: 100,
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
    source.emit("globalout")
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

  it("copies an absolute zoom range without echoing it and detaches on leave", () => {
    const source = makeChart()
    const peer = makeChart()
    join(1, source)
    const leave = join(1, peer)
    peer.dispatchAction.mockImplementation(() => peer.emit("datazoom"))

    setChartSync(1, { crosshair: "off", zoom: false })
    source.emit("datazoom")
    expect(peer.dispatchAction).not.toHaveBeenCalled()

    setChartSync(1, { crosshair: "off", zoom: true })
    source.emit("datazoom")
    expect(peer.dispatchAction).toHaveBeenCalledTimes(1)
    expect(peer.dispatchAction).toHaveBeenCalledWith({
      type: "dataZoom",
      startValue: 0,
      endValue: 1_000,
    })
    expect(source.dispatchAction).not.toHaveBeenCalled()

    leave()
    expect(peer.off.mock.calls.map(([event]) => event)).toEqual([
      "updateAxisPointer",
      "globalout",
      "datazoom",
    ])
    source.emit("datazoom")
    peer.emit("datazoom")
    expect(peer.dispatchAction).toHaveBeenCalledTimes(1)
    expect(source.dispatchAction).not.toHaveBeenCalled()
  })
})
