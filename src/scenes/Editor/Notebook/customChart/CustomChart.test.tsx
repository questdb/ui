// @vitest-environment jsdom
import React from "react"
import { act, screen, waitFor } from "@testing-library/react"
import type { EChartsType } from "echarts"
import { ThemeProvider } from "styled-components"
import { afterEach, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import { darkTheme, lightTheme } from "../../../../theme"
import { echarts } from "../CellChart/echartsSetup"
import { primaryXControls } from "../CellChart/liveZoom"
import { joinChartSync, setChartSync } from "../interactions/chartSync"
import { interactionEvents } from "../interactions/chartInteractions"
import { clearRenderReport, getRenderReport } from "../renderReports"
import { clearNotebookChartZooms } from "../cellVirtualization/chartZoomStore"
import type { StatementRows } from "../visuals/statementRows"
import { CustomChart } from "./CustomChart"

// The world map's code cannot be downloaded (offline, a redeploy).
vi.mock("./maps", async (original) => ({
  ...(await original<typeof import("./maps")>()),
  isMapLoaded: () => false,
  ensureMaps: vi.fn(() => Promise.reject(new Error("chunk failed"))),
}))

const BUFFER_ID = 913

afterEach(() => {
  setChartSync(BUFFER_ID, undefined)
  clearNotebookChartZooms(BUFFER_ID)
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

// A chart is drawn on a new instance when the theme changes. These tests turn
// the theme dark together with adding a brush interaction.
const themed = (dark: boolean, node: React.ReactElement) => (
  <ThemeProvider theme={dark ? darkTheme : lightTheme}>{node}</ThemeProvider>
)

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

it("reports a world map that could not be loaded", async () => {
  // Given a custom map chart whose world map fails to download
  renderComponent(
    <CustomChart
      bufferId={BUFFER_ID}
      cellId="a"
      rawOption={{ series: [{ type: "map", map: "world" }] }}
      statements={[]}
      live={false}
      isFocused={false}
    />,
  )

  // Then the agent's report says so, as the pane does
  await waitFor(() =>
    expect(getRenderReport(BUFFER_ID, "a")?.problems).toContainEqual({
      path: "",
      message: "Could not load the world map. Reload the console to try again.",
      severity: "error",
    }),
  )
})

it("keeps a zoomed category chart's window across a remount and an unchanged save", async () => {
  // Given a custom bar chart over categories whose option opens on its last
  // fifth, zoomed by the user
  sizeCharts()
  const option = {
    xAxis: { type: "category" },
    yAxis: { type: "value" },
    series: [{ type: "bar", datasetId: "q0", encode: { x: "k", y: "v" } }],
    dataZoom: [{ type: "inside", start: 80, end: 100 }],
  }
  const statements: (StatementRows | null)[] = [
    {
      columns: [
        { name: "k", type: "SYMBOL" },
        { name: "v", type: "DOUBLE" },
      ],
      rows: Array.from({ length: 50 }, (_, i) => [`k${i}`, i]),
    },
  ]
  const chart = (brush: boolean, rawOption = option) =>
    themed(
      brush,
      <div data-hook="a">
        <CustomChart
          bufferId={BUFFER_ID}
          cellId="a"
          rawOption={rawOption}
          statements={statements}
          live={false}
          isFocused={false}
          interactions={brush ? { brush: { from: "f", to: "t" } } : undefined}
        />
      </div>,
    )
  const { container, rerender } = renderComponent(chart(false))
  const instance = () => {
    const host = container.querySelector<HTMLElement>("[_echarts_instance_]")
    return host ? echarts.getInstanceByDom(host) : undefined
  }
  const range = () =>
    (
      instance()?.getOption() as
        | { dataZoom?: { start: number; end: number }[] }
        | undefined
    )?.dataZoom?.[0]
  await waitFor(() => expect(range()).toMatchObject({ start: 80, end: 100 }))
  const first = instance()!
  act(() => {
    first.dispatchAction({ type: "dataZoom", start: 10, end: 30 })
  })
  await waitFor(() => expect(range()).toMatchObject({ start: 10, end: 30 }))

  // When the chart is drawn on a new instance (the theme changes as a brush
  // interaction is added)
  rerender(chart(true))
  await waitFor(() => {
    expect(instance()).toBeTruthy()
    expect(instance() !== first).toBe(true)
  })

  // Then it opens on the window the user chose, not the option's own
  await waitFor(() => expect(range()).toMatchObject({ start: 10, end: 30 }))
  const second = instance()

  // When Chart settings is saved with the same option (a new, equal object)
  rerender(chart(true, structuredClone(option)))
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)))

  // Then the chart keeps that window
  expect(instance()).toBe(second)
  expect(range()).toMatchObject({ start: 10, end: 30 })
})

it("does not retry a failed world map on every data refresh", async () => {
  // Given a custom map chart whose world map failed to download
  const { ensureMaps } = await import("./maps")
  vi.mocked(ensureMaps).mockClear()
  const map = (rows: number) => (
    <CustomChart
      bufferId={BUFFER_ID}
      cellId="a"
      rawOption={{ series: [{ type: "map", map: "world" }] }}
      statements={minutes(rows)}
      live={false}
      isFocused={false}
    />
  )
  const { rerender } = renderComponent(map(3))
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not load the world map",
  )

  // When its query refreshes with new rows
  rerender(map(4))

  // Then the alert stays and the map is not requested again
  expect(screen.queryByText("Loading map…")).not.toBeInTheDocument()
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Could not load the world map",
  )
  expect(ensureMaps).toHaveBeenCalledTimes(1)
})

it("keeps a time chart zoomed out to its full range across a remount", async () => {
  // Given a custom time chart that opens on the last half of its data, which
  // the user zoomed out to the full range
  sizeCharts()
  const statements = minutes(200)
  const chart = (brush: boolean) =>
    themed(
      brush,
      <CustomChart
        bufferId={BUFFER_ID}
        cellId="a"
        rawOption={AUTHORED}
        statements={statements}
        live={false}
        isFocused={false}
        interactions={brush ? { brush: { from: "f", to: "t" } } : undefined}
      />,
    )
  const { container, rerender } = renderComponent(chart(false))
  const instance = () => {
    const host = container.querySelector<HTMLElement>("[_echarts_instance_]")
    return host ? echarts.getInstanceByDom(host) : undefined
  }
  await waitFor(() => expect(primaryXControls(instance()!)).not.toHaveLength(0))
  const first = instance()!
  act(() => {
    first.dispatchAction({
      type: "dataZoom",
      dataZoomIndex: primaryXControls(first)[0].componentIndex,
      start: 0,
      end: 100,
    })
  })

  // When the chart is drawn on a new instance
  rerender(chart(true))
  await waitFor(() => {
    expect(instance()).toBeTruthy()
    expect(instance() !== first).toBe(true)
    expect(primaryXControls(instance()!)).not.toHaveLength(0)
  })

  // Then it still shows the full range, not the option's last half
  await waitFor(() => expect(percent(instance()!)).toEqual([0, 100]))
})

it("restores a time chart's share of its refreshed data after a remount", async () => {
  // Given an unlinked custom time chart zoomed to 10-30% of its data
  sizeCharts()
  const chart = (rows: number, brush: boolean) =>
    themed(
      brush,
      <CustomChart
        bufferId={BUFFER_ID}
        cellId="a"
        rawOption={PEER}
        statements={minutes(rows)}
        live={false}
        isFocused={false}
        interactions={brush ? { brush: { from: "f", to: "t" } } : undefined}
      />,
    )
  const { container, rerender } = renderComponent(chart(200, false))
  const instance = () => {
    const host = container.querySelector<HTMLElement>("[_echarts_instance_]")
    return host ? echarts.getInstanceByDom(host) : undefined
  }
  await waitFor(() => expect(primaryXControls(instance()!)).not.toHaveLength(0))
  const first = instance()!
  act(() => {
    first.dispatchAction({
      type: "dataZoom",
      dataZoomIndex: primaryXControls(first)[0].componentIndex,
      start: 10,
      end: 30,
    })
  })

  // When new rows arrive, then the chart is drawn on a new instance
  rerender(chart(300, false))
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
  const shown = values(first)
  rerender(chart(300, true))
  await waitFor(() => {
    expect(instance()).toBeTruthy()
    expect(instance() !== first).toBe(true)
  })

  // Then it shows the window it showed just before, not the times of the zoom
  await waitFor(() => expect(values(instance()!)).toEqual(shown))
})

it("records a zoom on a control that does not move the x axis", async () => {
  // Given a horizontal bar chart zoomed with a vertical slider on its y axis
  sizeCharts()
  const errors: unknown[] = []
  const chart = (brush: boolean) =>
    themed(
      brush,
      <CustomChart
        bufferId={BUFFER_ID}
        cellId="a"
        rawOption={{
          xAxis: { type: "value" },
          yAxis: { type: "category" },
          series: [
            { type: "bar", datasetId: "q0", encode: { x: "v", y: "k" } },
          ],
          dataZoom: [{ type: "slider", yAxisIndex: 0, orient: "vertical" }],
        }}
        statements={[
          {
            columns: [
              { name: "k", type: "SYMBOL" },
              { name: "v", type: "DOUBLE" },
            ],
            rows: Array.from({ length: 20 }, (_, i) => [`k${i}`, i]),
          },
        ]}
        live={false}
        isFocused={false}
        interactions={brush ? { brush: { from: "f", to: "t" } } : undefined}
      />,
    )
  const { container, rerender } = renderComponent(chart(false))
  const instance = () => {
    const host = container.querySelector<HTMLElement>("[_echarts_instance_]")
    return host ? echarts.getInstanceByDom(host) : undefined
  }
  const range = () =>
    (
      instance()?.getOption() as
        | { dataZoom?: { start: number; end: number }[] }
        | undefined
    )?.dataZoom?.[0]
  await waitFor(() => expect(range()).toBeDefined())
  const first = instance()!

  // When the user zooms it
  act(() => {
    try {
      first.dispatchAction({ type: "dataZoom", start: 20, end: 60 })
    } catch (error) {
      errors.push(error)
    }
  })

  // Then nothing throws, and a new instance opens on that window
  expect(errors).toEqual([])
  rerender(chart(true))
  await waitFor(() => {
    expect(instance()).toBeTruthy()
    expect(instance() !== first).toBe(true)
  })
  await waitFor(() => expect(range()).toMatchObject({ start: 20, end: 60 }))
})

it("writes the clicked dataset row's column after a filter transform", async () => {
  // Given desks, filtered to the open ones, drawn as bars whose click sets
  // the desk
  sizeCharts()
  const statements: StatementRows[] = [
    {
      columns: [
        { name: "desk", type: "SYMBOL" },
        { name: "open", type: "BOOLEAN" },
        { name: "id", type: "LONG" },
        { name: "pnl", type: "DOUBLE" },
      ],
      rows: [
        ["east", false, "9007199254740993", 1],
        ["west", true, "9007199254740995", 2],
        [null, true, "9007199254740997", 3],
      ],
    },
  ]
  const writes: Record<string, string>[] = []
  const chart = (column?: string) => {
    const interactions = { click: { variable: "desk", column } }
    return (
      <CustomChart
        bufferId={BUFFER_ID}
        cellId="a"
        rawOption={{
          dataset: [
            {
              id: "open",
              fromDatasetId: "q0",
              transform: {
                type: "filter",
                config: { dimension: "open", "=": true },
              },
            },
          ],
          xAxis: { type: "category" },
          yAxis: { type: "value" },
          series: [
            { type: "bar", datasetId: "open", encode: { x: "desk", y: "pnl" } },
          ],
        }}
        statements={statements}
        live={false}
        isFocused={false}
        interactions={interactions}
        events={interactionEvents(
          interactions,
          (values) => writes.push(values),
          () => statements,
        )}
      />
    )
  }
  const { container, rerender } = renderComponent(chart())
  const instance = () => {
    const host = container.querySelector<HTMLElement>("[_echarts_instance_]")
    return host ? echarts.getInstanceByDom(host) : undefined
  }
  await waitFor(() => expect(instance()?.getOption().series).toBeDefined())
  const click = (dataIndex: number) => {
    const chart = instance()!
    const params = (
      chart as unknown as {
        getModel(): {
          getSeriesByIndex(i: number): {
            getDataParams(i: number): Record<string, unknown>
          }
        }
      }
    )
      .getModel()
      .getSeriesByIndex(0)
      .getDataParams(dataIndex)
    act(() => {
      ;(
        chart as unknown as { trigger(name: string, event: unknown): void }
      ).trigger("click", { ...params, componentType: "series" })
    })
  }

  // When the user clicks both bars, unbound and then bound to the id
  click(0)
  click(1)
  rerender(chart("id"))
  click(1)

  // Then each writes its own row's desk (NULL for the unnamed one), then its
  // exact id
  expect(writes).toEqual([
    { desk: "'west'" },
    { desk: "null" },
    { desk: "9007199254740997" },
  ])
})
