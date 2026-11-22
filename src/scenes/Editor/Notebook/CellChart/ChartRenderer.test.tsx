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
  // jsdom supplies no canvas surface; ECharts still owns layout and merging.
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

it("does not retain a removed overlay when a plain series takes its slot", async () => {
  setChartSize()
  const view = (withMarker: boolean) => (
    <ChartRenderer
      animate={false}
      zoomWindow={{ start: 0, end: 100 }}
      height={400}
      option={{
        xAxis: { type: "value" },
        yAxis: { type: "value" },
        series: [
          {
            type: "line",
            name: "Price",
            data: [
              [0, 4],
              [1, 6],
            ],
          },
          withMarker
            ? {
                type: "line",
                name: "Thresholds",
                data: [],
                markLine: { data: [{ yAxis: 5 }] },
              }
            : {
                type: "line",
                name: "Volume",
                data: [
                  [0, 2],
                  [1, 9],
                ],
              },
        ],
      }}
    />
  )
  const { container, rerender } = renderComponent(view(true))
  const current = () => {
    const host = container.querySelector<HTMLElement>("[_echarts_instance_]")
    return host ? echarts.getInstanceByDom(host) : undefined
  }
  const original = current()
  expect(original).toBeDefined()
  rerender(view(false))
  await waitFor(() => {
    expect(current()).toBeDefined()
    expect(current()).not.toBe(original)
    const options = current()?.getOption() as {
      series: { name: string; markLine?: unknown }[]
    }
    expect(options.series.map((s) => s.name)).toEqual(["Price", "Volume"])
    expect(options.series.some((s) => s.markLine != null)).toBe(false)
  })
})

it("removes a horizontal bar chart's unused top scale", async () => {
  setChartSize()
  const view = (secondary: boolean) => (
    <ChartRenderer
      animate={false}
      zoomWindow={{ start: 0, end: 100 }}
      height={400}
      option={{
        xAxis: secondary
          ? [
              { type: "value" },
              { type: "value", position: "top", name: "Secondary" },
            ]
          : { type: "value" },
        yAxis: { type: "category", data: ["East", "West"] },
        series: [
          { type: "bar", name: "Primary", data: [1, 2], xAxisIndex: 0 },
          {
            type: "bar",
            name: "Secondary",
            data: [3, 4],
            xAxisIndex: secondary ? 1 : 0,
          },
        ],
      }}
    />
  )
  const { container, rerender } = renderComponent(view(true))
  const options = () => {
    const host = container.querySelector<HTMLElement>("[_echarts_instance_]")
    return host && echarts.getInstanceByDom(host)?.getOption()
  }
  await waitFor(() => expect(options()?.xAxis).toHaveLength(2))
  rerender(view(false))
  await waitFor(() => expect(options()?.xAxis).toHaveLength(1))
})

it("uses the current data and restores zoom when the chart theme changes", async () => {
  setChartSize()
  // Given a mounted chart that has already merged a newer result
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

it("discards timestamp zoom bounds when remounting on a numeric axis", async () => {
  setChartSize()
  const onZoomChange = vi.fn()
  const view = (axis: "time" | "value") => (
    <ChartRenderer
      option={{
        xAxis: { type: axis },
        yAxis: { type: "value" },
        dataZoom: [{ type: "inside" }],
        series: [
          {
            type: "line",
            data: Array.from({ length: 500 }, (_, i) => [i * 1000, i]),
          },
        ],
      }}
      zoomWindow={{
        start: 20,
        end: 80,
        bounds: { startValue: 1767225799800, endValue: 1767226399200 },
      }}
      onZoomChange={onZoomChange}
      animate={false}
      height={400}
    />
  )
  const { rerender, container } = renderComponent(view("time"))
  rerender(view("value"))
  await waitFor(() => {
    expect(onZoomChange).toHaveBeenCalledWith(0, 100)
    const host = container.querySelector<HTMLElement>("[_echarts_instance_]")
    expect(
      host && echarts.getInstanceByDom(host)?.getOption().dataZoom,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ start: 0, end: 100 })]),
    )
  })
})

it("matches each scatter color scale to the new series order after a refresh", async () => {
  setChartSize()
  const view = (names: string[], first: number[]) => (
    <ChartRenderer
      option={{
        xAxis: { type: "value" },
        yAxis: { type: "value" },
        series: names.map((name) => ({
          type: "scatter",
          name,
          data: [[1, 2]],
        })),
        visualMap: [
          { min: 0, max: 10, seriesIndex: first },
          {
            min: 10,
            max: 20,
            seriesIndex: names
              .map((_, index) => index)
              .filter((index) => !first.includes(index)),
          },
        ],
      }}
      zoomWindow={{ start: 0, end: 100 }}
      animate={false}
      height={400}
    />
  )
  const { container, rerender } = renderComponent(view(["a1", "b1", "b2"], [0]))
  const targets = () => {
    const host = container.querySelector<HTMLElement>("[_echarts_instance_]")
    if (!host) return undefined
    const option = echarts.getInstanceByDom(host)?.getOption() as
      | {
          series: { name: string }[]
          visualMap: { seriesIndex: number[] }[]
        }
      | undefined
    return option?.visualMap.map(({ seriesIndex }) =>
      seriesIndex.map((i) => option.series[i].name),
    )
  }
  await waitFor(() => expect(targets()).toEqual([["a1"], ["b1", "b2"]]))
  rerender(view(["a1", "a2", "b1"], [0, 1]))
  await waitFor(() => expect(targets()).toEqual([["a1", "a2"], ["b1"]]))
})
