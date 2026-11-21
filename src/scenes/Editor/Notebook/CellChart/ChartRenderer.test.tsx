// @vitest-environment jsdom
import React from "react"
import { act, waitFor } from "@testing-library/react"
import type { EChartsOption, EChartsType } from "echarts"
import { ThemeProvider } from "styled-components"
import { expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import { darkTheme, lightTheme } from "../../../../theme"
import { ChartRenderer } from "./ChartRenderer"
import { echarts } from "./echartsSetup"

vi.mock("../NotebookProvider", () => ({ useNotebookBufferId: () => undefined }))

it("uses the current data and restores zoom when the chart theme changes", async () => {
  // Given a mounted chart that has already merged a newer result
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 620, 700, 400),
  )
  for (const [property, size] of [
    ["clientWidth", 700],
    ["clientHeight", 400],
  ] as const) {
    vi.spyOn(HTMLElement.prototype, property, "get").mockReturnValue(size)
  }
  // jsdom supplies no canvas surface; ECharts still owns layout and merging.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      return new Proxy(
        {
          canvas: this,
          measureText: (text: string) => ({ width: text.length * 7 }),
        },
        {
          get: (target, key): unknown =>
            (Reflect.get(target, key) as unknown) ?? (() => undefined),
        },
      ) as unknown as CanvasRenderingContext2D
    } as unknown as typeof HTMLCanvasElement.prototype.getContext,
  )
  const option = (reading: number): EChartsOption => ({
    xAxis: { type: "time" },
    yAxis: { type: "value" },
    dataZoom: [{ type: "inside" }],
    series: [
      {
        type: "line",
        data: Array.from({ length: 500 }, (_, i) => [i * 1000, reading]),
      },
    ],
  })
  const view = (
    theme: typeof lightTheme,
    reading: number,
    zoomWindow = { start: 0, end: 100 },
  ) => (
    <ThemeProvider theme={theme}>
      <ChartRenderer
        option={option(reading)}
        zoomWindow={zoomWindow}
        animate={false}
        height={400}
      />
    </ThemeProvider>
  )
  const { container, rerender } = renderComponent(view(lightTheme, 11))
  const read = (): EChartsType | undefined => {
    const host = container.querySelector<HTMLElement>("[_echarts_instance_]")
    return host ? echarts.getInstanceByDom(host) : undefined
  }
  const currentReading = () =>
    (
      read()?.getOption() as
        | { series?: { data: [number, number][] }[] }
        | undefined
    )?.series?.[0]?.data?.[0]?.[1]
  await waitFor(() => expect(currentReading()).toBe(11))
  rerender(view(lightTheme, 88))
  await waitFor(() => expect(currentReading()).toBe(88))
  const zoom = { start: 20, end: 80 }
  act(() => {
    read()?.dispatchAction({ type: "dataZoom", ...zoom })
  })
  const currentZoom = () =>
    (
      read()?.getOption() as
        | { dataZoom?: { start: number; end: number }[] }
        | undefined
    )?.dataZoom?.map(({ start, end }) => ({ start, end }))
  expect(currentZoom()).toContainEqual(zoom)

  // When the user changes theme, then the current frame and range survive
  rerender(view(darkTheme, 88, zoom))
  await waitFor(() => {
    expect(currentReading()).toBe(88)
    expect(currentZoom()).toContainEqual(zoom)
  })
})
