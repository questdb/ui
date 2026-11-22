// @vitest-environment jsdom
import React from "react"
import { act, waitFor } from "@testing-library/react"
import type { EChartsType } from "echarts"
import { afterEach, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import { echarts } from "../CellChart/echartsSetup"
import { primaryXControls } from "../CellChart/liveZoom"
import { joinChartSync, setChartSync } from "../interactions/chartSync"
import { clearRenderReport } from "../renderReports"
import type { StatementRows } from "../visuals/statementRows"
import { CustomChart } from "./CustomChart"

const BUFFER_ID = 913

afterEach(() => {
  setChartSync(BUFFER_ID, undefined)
  clearRenderReport(BUFFER_ID, "a")
  clearRenderReport(BUFFER_ID, "b")
  vi.restoreAllMocks()
})

const sizeCharts = () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 700, 400),
  )
  for (const [property, size] of [
    ["clientWidth", 700],
    ["clientHeight", 400],
  ] as const) {
    vi.spyOn(HTMLElement.prototype, property, "get").mockReturnValue(size)
  }
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      return new Proxy(
        {
          canvas: this,
          measureText: (text: string) => ({ width: text.length * 7 }),
          createLinearGradient: () => ({ addColorStop: () => undefined }),
        },
        {
          get: (target, key): unknown =>
            (Reflect.get(target, key) as unknown) ?? (() => undefined),
        },
      ) as unknown as CanvasRenderingContext2D
    } as unknown as typeof HTMLCanvasElement.prototype.getContext,
  )
}

const T0 = Date.UTC(2026, 0, 1)
const minutes = (n: number): (StatementRows | null)[] => [
  {
    columns: [
      { name: "ts", type: "TIMESTAMP" },
      { name: "v", type: "DOUBLE" },
    ],
    rows: Array.from({ length: n }, (_, i) => [
      new Date(T0 + i * 60_000).toISOString(),
      i,
    ]),
  },
]

const optionWith = (zoom: Record<string, unknown>) => ({
  xAxis: { type: "time" },
  yAxis: { type: "value" },
  series: [{ type: "line", datasetId: "q0", encode: { x: "ts", y: "v" } }],
  dataZoom: [{ type: "inside", ...zoom }],
})
// The author opens the chart on the last half of its data.
const AUTHORED = optionWith({ start: 50, end: 100 })
const PEER = optionWith({})
const PEER_ROWS = minutes(200)

const Charts = ({
  rows,
  withPeer,
  onInstance,
}: {
  rows: number
  withPeer: boolean
  onInstance: (instance: EChartsType | null) => void
}) => {
  const statements = React.useMemo(() => minutes(rows), [rows])
  const props = {
    bufferId: BUFFER_ID,
    chartTypes: undefined,
    live: false,
    isFocused: false,
    onInstance,
  }
  return (
    <>
      <div data-hook="a">
        <CustomChart
          {...props}
          cellId="a"
          rawOption={AUTHORED}
          statements={statements}
        />
      </div>
      {withPeer && (
        <div data-hook="b">
          <CustomChart
            {...props}
            cellId="b"
            rawOption={PEER}
            statements={PEER_ROWS}
          />
        </div>
      )}
    </>
  )
}

const percent = (instance: EChartsType) =>
  primaryXControls(instance)[0]?.getPercentRange()?.map(Math.round)
const values = (instance: EChartsType) =>
  primaryXControls(instance)[0]?.getValueRange("x", 0)?.map(Math.round)

it.each([false, true])(
  "keeps a zoomed custom chart's window across a refresh (linked peer: %s)",
  async (withPeer) => {
    // Given a custom time chart whose option sets a zoom window
    sizeCharts()
    setChartSync(
      BUFFER_ID,
      withPeer ? { crosshair: "off", zoom: true } : undefined,
    )
    const leaves: (() => void)[] = []
    const join = (instance: EChartsType | null) => {
      if (instance) leaves.push(joinChartSync(BUFFER_ID, instance))
    }
    const { container, rerender } = renderComponent(
      <Charts rows={200} withPeer={withPeer} onInstance={join} />,
    )
    const chart = (hook: string) => {
      const host = container.querySelector<HTMLElement>(
        `[data-hook="${hook}"] [_echarts_instance_]`,
      )
      return host ? echarts.getInstanceByDom(host) : undefined
    }
    await waitFor(() => {
      expect(primaryXControls(chart("a")!)).not.toHaveLength(0)
      if (withPeer) expect(chart("b")).toBeTruthy()
    })
    const a = chart("a")!
    expect(percent(a)).toEqual([50, 100])

    // When the user zooms it, then its query refreshes with one more row
    act(() => {
      a.dispatchAction({
        type: "dataZoom",
        dataZoomIndex: primaryXControls(a)[0].componentIndex,
        start: 10,
        end: 30,
      })
    })
    const zoomed = values(a)
    rerender(<Charts rows={201} withPeer={withPeer} onInstance={join} />)
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))

    // Then it keeps the user's window, not the authored one: the same times
    // as its linked peer, or alone the same share of its data
    expect(chart("a")).toBe(a)
    if (withPeer) {
      expect(values(a)).toEqual(zoomed)
      expect(values(chart("b")!)).toEqual(zoomed)
    } else {
      expect(percent(a)).toEqual([10, 30])
    }
    leaves.forEach((leave) => leave())
  },
)
