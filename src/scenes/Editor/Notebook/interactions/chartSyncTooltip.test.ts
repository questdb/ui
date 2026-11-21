// @vitest-environment jsdom
import { expect, it, vi } from "vitest"
import {
  buildEchartsOption,
  withZoomDensity,
} from "../CellChart/buildEchartsOption"
import { echarts } from "../CellChart/echartsSetup"
import { resolveDraw, toChartResult } from "../DrawCanvas/drawCanvasUtils"
import { joinChartSync, setChartSync } from "./chartSync"

it("syncs a peer’s pointer without showing its tooltip in crosshair-only mode", () => {
  vi.useFakeTimers()
  // jsdom has no Canvas2D; this stubs only drawing and text measurement.
  const context = vi
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
  const mounted: Array<{
    instance: ReturnType<typeof echarts.init>
    host: HTMLElement
  }> = []
  const leaves: Array<() => void> = []
  const time = "2026-01-01T00:01:00.000Z"
  function chart(metric: string, value: number) {
    const query = `select ts, ${metric} from metrics`
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
            dataset: [
              ["2026-01-01T00:00:00.000Z", value - 1],
              [time, value],
              ["2026-01-01T00:02:00.000Z", value + 1],
            ],
            count: 3,
            timestamp: 0,
          },
        ],
      },
      [query],
    )
    if (options.kind !== "settled")
      throw new Error(`Unexpected result: ${options.kind}`)
    const resolution = resolveDraw([query], options.results, undefined)
    expect(resolution.renderQueries[0]?.type).toBe("line")
    const option = withZoomDensity(
      buildEchartsOption(resolution.chart, resolution.renderQueries),
      { wheel: true, slider: true },
    )
    expect(option.xAxis).toMatchObject({ type: "time" })
    expect(option.tooltip).toMatchObject({ trigger: "axis" })
    const host = document.createElement("div")
    document.body.append(host)
    const instance = echarts.init(host, undefined, {
      renderer: "canvas",
      width: 640,
      height: 300,
    })
    mounted.push({ instance, host })
    instance.setOption({ ...option, animation: false })
    leaves.push(joinChartSync(42, instance))
    return { instance, host }
  }
  try {
    const source = chart("source_metric", 17)
    const peer = chart("peer_metric", 2718)
    const observedAxes: unknown[] = []
    const peerMoves: unknown[] = []
    source.instance.on("updateAxisPointer", (event) => {
      observedAxes.push(event)
    })
    peer.instance.on("updateAxisPointer", (event) => {
      peerMoves.push(event)
    })
    const target = source.host.querySelector("canvas")!
    const x = source.instance.convertToPixel(
      { xAxisIndex: 0 },
      Date.parse(time),
    )
    const y = 150
    expect(source.instance.containPixel({ gridIndex: 0 }, [x, y])).toBe(true)
    expect(peer.instance.containPixel({ gridIndex: 0 }, [x, y])).toBe(true)
    const hover = () => {
      target.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, clientX: x, clientY: y }),
      )
      vi.advanceTimersByTime(800)
    }
    const visible = (host: HTMLElement) => {
      return Array.from(host.querySelectorAll("div")).filter(
        (el) =>
          !!el.textContent &&
          el.style.display === "block" &&
          el.style.visibility !== "hidden" &&
          el.style.opacity !== "0",
      )
    }
    setChartSync(42, { crosshair: "off", zoom: false })
    hover()
    expect(observedAxes.at(-1)).toMatchObject({
      axesInfo: [{ axisDim: "x", axisIndex: 0, value: Date.parse(time) }],
    })
    expect(visible(source.host)[0]?.textContent).toContain("source_metric")
    expect(peerMoves).toHaveLength(0)
    expect(visible(peer.host)).toHaveLength(0)

    setChartSync(42, { crosshair: "line", zoom: false })
    hover()
    expect(peerMoves.at(-1)).toMatchObject({
      axesInfo: [{ axisDim: "x", axisIndex: 0, value: Date.parse(time) }],
    })
    expect(visible(peer.host)).toHaveLength(0)

    setChartSync(42, { crosshair: "tooltip", zoom: false })
    hover()
    expect(visible(peer.host)[0]?.textContent).toContain("peer_metric")
  } finally {
    for (const leave of leaves) leave()
    setChartSync(42, undefined)
    for (const { instance, host } of mounted) {
      instance.dispose()
      host.remove()
    }
    context.mockRestore()
    vi.useRealTimers()
  }
})
