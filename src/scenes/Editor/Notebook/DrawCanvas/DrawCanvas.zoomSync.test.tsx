// @vitest-environment jsdom
import React from "react"
import { act, waitFor } from "@testing-library/react"
import type { EChartsType } from "echarts"
import { expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import type { NotebookCell } from "../../../../store/notebook"
import { echarts } from "../CellChart/echartsSetup"
import { primaryXControls } from "../CellChart/liveZoom"
import {
  clearChartZoom,
  getChartZoom,
  resetChartZoom,
} from "../cellVirtualization/chartZoomStore"
import { DrawCanvas } from "./index"

vi.mock("../NotebookProvider", () => ({
  useNotebookBufferId: () => 909,
  useNotebookSettings: () => ({
    chartSync: { crosshair: "off", zoom: true },
  }),
  useNotebookActions: () => ({
    setVariableValues: () => undefined,
    updateSettings: () => undefined,
    getVariables: () => [],
  }),
}))
vi.mock("../../../../modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))

const setChartSize = () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 620, 700, 400),
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

const cell = (id: string, metric: string): NotebookCell => {
  const value = `select ts, ${metric} from metrics`
  return {
    id,
    position: id === "fa" ? 0 : 1,
    value,
    mode: "draw",
    result: {
      activeResultIndex: 0,
      timestamp: 1,
      results: [
        {
          type: "dql",
          query: value,
          columns: [
            { name: "ts", type: "TIMESTAMP" },
            { name: metric, type: "DOUBLE" },
          ],
          dataset: Array.from({ length: 200 }, (_, i) => [
            new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
            i,
          ]),
          count: 200,
          timestamp: 0,
        },
      ],
    } as unknown as NotebookCell["result"],
  }
}

const noop = () => undefined

const percent = (instance: EChartsType) =>
  primaryXControls(instance)[0]?.getPercentRange()?.map(Math.round)

const mount = async () => {
  setChartSize()
  const { container } = renderComponent(
    <>
      <div style={{ height: 400 }}>
        <DrawCanvas
          cell={cell("fa", "a_metric")}
          isFocused={false}
          refreshIntervalMs={undefined}
          onSettingsChange={noop}
          onRetryUnmountWhileFocused={noop}
        />
      </div>
      <div style={{ height: 400 }}>
        <DrawCanvas
          cell={cell("fb", "b_metric")}
          isFocused={false}
          refreshIntervalMs={undefined}
          onSettingsChange={noop}
          onRetryUnmountWhileFocused={noop}
        />
      </div>
    </>,
  )
  const instances = () =>
    Array.from(container.querySelectorAll<HTMLElement>("[_echarts_instance_]"))
      .map((host) => echarts.getInstanceByDom(host))
      .filter((i): i is EChartsType => !!i)
  await waitFor(() => {
    expect(instances()).toHaveLength(2)
    for (const i of instances()) expect(primaryXControls(i)).not.toHaveLength(0)
  })
  const [a, b] = instances()
  // The user zooms chart A (a non-silent dataZoom on its primary x control,
  // as the slider/wheel produce); chart sync carries the window to chart B.
  act(() => {
    a.dispatchAction({
      type: "dataZoom",
      dataZoomIndex: primaryXControls(a)[0].componentIndex,
      start: 20,
      end: 60,
    })
  })
  await waitFor(() => {
    expect(percent(a)).toEqual([20, 60])
    expect(percent(b)).toEqual([20, 60])
    expect(getChartZoom("fa")).toBeDefined()
    expect(getChartZoom("fb")).toBeDefined()
  })
  return { a, b }
}

it("resets only the edited chart when its SQL changes", async () => {
  try {
    const { a, b } = await mount()
    // When the engine applies a statement-changing SQL edit to cell A
    act(() => resetChartZoom("fa", true))
    // Then A resets, B keeps its window
    expect(percent(a)).toEqual([0, 100])
    expect(getChartZoom("fa")).toBeUndefined()
    expect(percent(b)).toEqual([20, 60])
    expect(getChartZoom("fb")).toBeDefined()
  } finally {
    clearChartZoom("fa")
    clearChartZoom("fb")
  }
})

it("resets linked peers when the user resets zoom", async () => {
  try {
    const { a, b } = await mount()
    act(() => resetChartZoom("fa"))
    expect(percent(a)).toEqual([0, 100])
    expect(percent(b)).toEqual([0, 100])
    expect(getChartZoom("fb")).toBeUndefined()
  } finally {
    clearChartZoom("fa")
    clearChartZoom("fb")
  }
})
