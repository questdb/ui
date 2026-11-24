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
import {
  chartZoomed,
  clearChartZoom,
  setChartZoom,
} from "../cellVirtualization/chartZoomStore"

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
    // The same instance draws the new option in full: no remount
    expect(current()).toBe(original)
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
  const scope = { bufferId: 61, cellId: "theme" }
  const view = (theme: typeof lightTheme, reading: number) => (
    <ThemeProvider theme={theme}>
      <ChartRenderer
        option={option(reading)}
        zoomScope={scope}
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
  const before = read()
  rerender(view(darkTheme, 88))
  await waitFor(() => {
    expect(read()).not.toBe(before)
    expect(currentReading()).toBe(88)
    expect(currentZoom()).toContainEqual(zoom)
  })
  clearChartZoom(scope)
})

it("discards a time zoom window when the x axis turns numeric", async () => {
  setChartSize()
  const scope = { bufferId: 61, cellId: "axis" }
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
      zoomScope={scope}
      animate={false}
      height={400}
    />
  )
  // Given a time chart zoomed to a time window
  setChartZoom(scope, "x0", {
    mode: "pinned",
    from: 1767225799800,
    to: 1767226399200,
    axis: "time",
  })
  const { rerender, container } = renderComponent(view("time"))
  await waitFor(() => expect(chartZoomed(scope)).toBe(true))

  // When its x axis turns numeric
  rerender(view("value"))

  // Then the chart shows all its data and is no longer zoomed
  await waitFor(() => {
    expect(chartZoomed(scope)).toBe(false)
    const host = container.querySelector<HTMLElement>("[_echarts_instance_]")
    expect(
      host && echarts.getInstanceByDom(host)?.getOption().dataZoom,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ start: 0, end: 100 })]),
    )
  })
  clearChartZoom(scope)
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

it("keeps series hidden in the legend across refreshes and a theme change", async () => {
  setChartSize()
  const scope = { bufferId: 61, cellId: "legend" }
  const view = (theme: typeof lightTheme, reading: number) => (
    <ThemeProvider theme={theme}>
      <ChartRenderer
        option={{
          legend: {},
          xAxis: { type: "value" },
          yAxis: { type: "value" },
          series: ["Bid", "Ask"].map((name) => ({
            type: "line",
            name,
            data: [
              [0, reading],
              [1, reading + 1],
            ],
          })),
        }}
        zoomScope={scope}
        animate={false}
        height={400}
      />
    </ThemeProvider>
  )
  const { container, rerender } = renderComponent(view(lightTheme, 1))
  const read = (): EChartsType | undefined => {
    const host = container.querySelector<HTMLElement>("[_echarts_instance_]")
    return host ? echarts.getInstanceByDom(host) : undefined
  }
  const hidden = () =>
    (
      read()?.getOption() as
        | { legend?: { selected?: Record<string, boolean> }[] }
        | undefined
    )?.legend?.[0]?.selected?.Ask === false
  // The instance drawing the option (not the one echarts-for-react measures)
  await waitFor(() => expect(read()?.getOption()?.series).toBeDefined())

  // Given the user hides a series in the legend
  act(() => {
    read()?.dispatchAction({ type: "legendUnSelect", name: "Ask" })
  })
  expect(hidden()).toBe(true)

  // When the chart refreshes, and then the theme changes
  rerender(view(lightTheme, 5))
  await waitFor(() => expect(hidden()).toBe(true))
  rerender(view(darkTheme, 6))

  // Then the series stays hidden
  await waitFor(() => {
    expect(
      (read()?.getOption() as { series: { data: number[][] }[] }).series[0]
        .data[0][1],
    ).toBe(6)
    expect(hidden()).toBe(true)
  })
  clearChartZoom(scope)
})

it("arms the brush again after every draw", async () => {
  setChartSize()
  const armed: unknown[] = []
  const brushOf = (instance: EChartsType) =>
    (
      instance as unknown as {
        getModel(): {
          getComponent(type: "brush", i: number): { brushType?: unknown }
        }
      }
    )
      .getModel()
      .getComponent("brush", 0)?.brushType
  const view = (reading: number) => (
    <ChartRenderer
      option={{
        xAxis: { type: "time" },
        yAxis: { type: "value" },
        brush: { toolbox: [], xAxisIndex: 0, brushType: "lineX" },
        series: [
          {
            type: "line",
            data: [
              [0, reading],
              [1000, reading],
            ],
          },
        ],
      }}
      animate={false}
      height={400}
      onDraw={(instance) => {
        instance.dispatchAction({
          type: "takeGlobalCursor",
          key: "brush",
          brushOption: { brushType: "lineX", brushMode: "single" },
        })
        armed.push(brushOf(instance))
      }}
    />
  )
  const { container, rerender } = renderComponent(view(1))
  const read = (): EChartsType | undefined => {
    const host = container.querySelector<HTMLElement>("[_echarts_instance_]")
    return host ? echarts.getInstanceByDom(host) : undefined
  }
  await waitFor(() => expect(armed).toEqual(["lineX"]))
  // When the chart is drawn again with new data, the brush stays armed
  rerender(view(2))
  await waitFor(() => expect(armed.length).toBeGreaterThanOrEqual(2))
  expect(brushOf(read()!)).toBe("lineX")
})
