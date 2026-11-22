// @vitest-environment jsdom
import React from "react"
import { act, screen, waitFor } from "@testing-library/react"
import type { EChartsType } from "echarts"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import { echarts } from "../CellChart/echartsSetup"
import { primaryXControls } from "../CellChart/liveZoom"
import { joinChartSync, setChartSync } from "../interactions/chartSync"
import { clearRenderReport, getRenderReport } from "../renderReports"
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

it("reports a world map that could not be loaded", async () => {
  // Given a custom map chart whose world map fails to download
  renderComponent(
    <CustomChart
      bufferId={BUFFER_ID}
      cellId="a"
      rawOption={{ series: [{ type: "map", map: "world" }] }}
      statements={[]}
      chartTypes={undefined}
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
  const chart = (brush: boolean, rawOption = option) => (
    <div data-hook="a">
      <CustomChart
        bufferId={BUFFER_ID}
        cellId="a"
        rawOption={rawOption}
        statements={statements}
        chartTypes={undefined}
        live={false}
        isFocused={false}
        interactions={brush ? { brush: { from: "f", to: "t" } } : undefined}
      />
    </div>
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

  // When the chart is drawn on a new instance (a brush interaction is added)
  rerender(chart(true))
  await waitFor(() => {
    expect(instance()).toBeTruthy()
    expect(instance()).not.toBe(first)
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
      chartTypes={undefined}
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
  const chart = (brush: boolean) => (
    <CustomChart
      bufferId={BUFFER_ID}
      cellId="a"
      rawOption={AUTHORED}
      statements={statements}
      chartTypes={undefined}
      live={false}
      isFocused={false}
      interactions={brush ? { brush: { from: "f", to: "t" } } : undefined}
    />
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
    expect(instance()).not.toBe(first)
    expect(primaryXControls(instance()!)).not.toHaveLength(0)
  })

  // Then it still shows the full range, not the option's last half
  await waitFor(() => expect(percent(instance()!)).toEqual([0, 100]))
})

it("reports a chart type that throws on some rows of its draw", async () => {
  // Given an allowed chart type that cannot draw a NULL value, over rows with
  // one NULL among them
  sizeCharts()
  renderComponent(
    <CustomChart
      bufferId={BUFFER_ID}
      cellId="a"
      rawOption={{
        xAxis: { type: "value" },
        yAxis: { type: "value" },
        series: [
          {
            type: "custom",
            renderItem: "dots",
            datasetId: "q0",
            encode: { x: "x", y: "y" },
          },
        ],
      }}
      statements={[
        {
          columns: [
            { name: "x", type: "DOUBLE" },
            { name: "y", type: "DOUBLE" },
          ],
          rows: [
            [1, 10],
            [2, null],
            [3, 30],
          ],
        },
      ]}
      chartTypes={[
        {
          name: "dots",
          allowed: true,
          renderItem: `
            const y = api.value(1)
            if (y == null || Number.isNaN(y)) throw new Error("y is missing")
            const p = api.coord([api.value(0), y])
            return { type: "circle", shape: { cx: p[0], cy: p[1], r: 4 } }
          `,
        },
      ]}
      live={false}
      isFocused={false}
    />,
  )

  // Then, once drawn, the agent's report names the error, although the rows
  // after the failing one drew
  await waitFor(() =>
    expect(getRenderReport(BUFFER_ID, "a")?.problems).toContainEqual({
      path: "chartTypes.dots",
      message: 'Chart type "dots" threw while drawing: y is missing',
      severity: "error",
    }),
  )
})

it("restores a time chart's share of its refreshed data after a remount", async () => {
  // Given an unlinked custom time chart zoomed to 10-30% of its data
  sizeCharts()
  const chart = (rows: number, brush: boolean) => (
    <CustomChart
      bufferId={BUFFER_ID}
      cellId="a"
      rawOption={PEER}
      statements={minutes(rows)}
      chartTypes={undefined}
      live={false}
      isFocused={false}
      interactions={brush ? { brush: { from: "f", to: "t" } } : undefined}
    />
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
    expect(instance()).not.toBe(first)
  })

  // Then it shows the window it showed just before, not the times of the zoom
  await waitFor(() => expect(values(instance()!)).toEqual(shown))
})

it("records a zoom on a control that does not move the x axis", async () => {
  // Given a horizontal bar chart zoomed with a vertical slider on its y axis
  sizeCharts()
  const errors: unknown[] = []
  const chart = (brush: boolean) => (
    <CustomChart
      bufferId={BUFFER_ID}
      cellId="a"
      rawOption={{
        xAxis: { type: "value" },
        yAxis: { type: "category" },
        series: [{ type: "bar", datasetId: "q0", encode: { x: "v", y: "k" } }],
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
      chartTypes={undefined}
      live={false}
      isFocused={false}
      interactions={brush ? { brush: { from: "f", to: "t" } } : undefined}
    />
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
    expect(instance()).not.toBe(first)
  })
  await waitFor(() => expect(range()).toMatchObject({ start: 20, end: 60 }))
})

describe("chart type draw errors", () => {
  const dots = {
    name: "dots",
    allowed: true,
    renderItem: `
      const y = api.value(1)
      if (y == null || Number.isNaN(y)) throw new Error("y is missing")
      const p = api.coord([api.value(0), y])
      return { type: "circle", shape: { cx: p[0], cy: p[1], r: 4 } }
    `,
  }
  const xy = (rows: (number | null)[][]): StatementRows => ({
    columns: [
      { name: "x", type: "DOUBLE" },
      { name: "y", type: "DOUBLE" },
    ],
    rows,
  })
  const seriesOn = (datasetId: string) => ({
    type: "custom",
    renderItem: "dots",
    datasetId,
    encode: { x: "x", y: "y" },
  })
  const chartIn = (
    cellId: string,
    series: object[],
    statements: (StatementRows | null)[],
  ) => (
    <CustomChart
      bufferId={BUFFER_ID}
      cellId={cellId}
      rawOption={{
        xAxis: { type: "value" },
        yAxis: { type: "value" },
        series,
      }}
      statements={statements}
      chartTypes={[dots]}
      live={false}
      isFocused={false}
    />
  )
  const threw = (cellId: string) =>
    (getRenderReport(BUFFER_ID, cellId)?.problems ?? []).filter(
      (problem) => problem.path === "chartTypes.dots",
    )

  it("keeps a failing series reported when a later series of the type draws", async () => {
    // Given one chart whose first series of a type has a NULL and whose
    // second series of the same type draws cleanly
    sizeCharts()
    renderComponent(
      chartIn(
        "a",
        [seriesOn("q0"), seriesOn("q1")],
        [
          xy([
            [1, 10],
            [2, null],
          ]),
          xy([
            [1, 20],
            [2, 30],
          ]),
        ],
      ),
    )

    // Then the report still names the first series' error
    await waitFor(() => expect(threw("a")).toHaveLength(1))
  })

  it("keeps an error of an early chunk of a large series reported", async () => {
    // Given a series of 3,500 rows, drawn in chunks, NULL in the first chunk
    sizeCharts()
    renderComponent(
      chartIn(
        "a",
        [seriesOn("q0")],
        [xy(Array.from({ length: 3500 }, (_, i) => [i, i === 1 ? null : i]))],
      ),
    )

    // Then, after the later chunks draw, the report still names the error
    await waitFor(() => expect(threw("a")).toHaveLength(1), { timeout: 3000 })
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)))
    expect(threw("a")).toHaveLength(1)
  })

  it("keeps each cell's draw errors its own", async () => {
    // Given two cells drawing the same chart type, only the first failing
    sizeCharts()
    renderComponent(
      <>
        {chartIn(
          "a",
          [seriesOn("q0")],
          [
            xy([
              [1, 10],
              [2, null],
            ]),
          ],
        )}
        {chartIn(
          "b",
          [seriesOn("q0")],
          [
            xy([
              [1, 10],
              [2, 20],
            ]),
          ],
        )}
      </>,
    )

    // Then the failing cell reports its error and the other cell does not
    await waitFor(() => {
      expect(threw("a")).toHaveLength(1)
      expect(getRenderReport(BUFFER_ID, "b")).toBeDefined()
    })
    await act(() => new Promise((resolve) => setTimeout(resolve, 150)))
    expect(threw("a")).toHaveLength(1)
    expect(threw("b")).toHaveLength(0)
  })
})
