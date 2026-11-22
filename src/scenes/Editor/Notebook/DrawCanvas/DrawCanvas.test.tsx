// @vitest-environment jsdom
import React from "react"
import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import type {
  NotebookCell,
  SingleQueryResult,
} from "../../../../store/notebook"
import { echarts } from "../CellChart/echartsSetup"
import { X_WHEEL_ZOOM_ID, Y_SLIDER_ZOOM_ID } from "../CellChart/chartDensity"
import { CellViewToggle } from "../cells/CellViewToggle"
import { useChartZoomed } from "../cells/useChartZoomed"
import {
  clearChartZoom,
  getChartZoom,
} from "../cellVirtualization/chartZoomStore"
import { DrawCanvas } from "."

const fetchState = vi.hoisted(() => ({
  queries: [] as string[],
  queriesKey: "draw",
  settledKey: "draw",
  classifyBlock: null,
  fetchCancelled: false,
}))
vi.mock("../NotebookProvider", () => ({
  useNotebookBufferId: () => 1,
  useNotebookActions: () => ({}),
}))
vi.mock("../cellRefresh/CellRefreshContext", () => ({
  useCellFetchSelector: () => fetchState,
  shallowEqual: Object.is,
}))
vi.mock("../cells/useChartLoading", () => ({
  useChartLoading: () => ({ loading: false }),
}))
vi.mock("../CellChart/ChartSettingsDrawer", () => ({
  ChartSettingsDrawer: () => null,
}))
vi.mock("../settingsDrawer/useSettingsDrawerSession", () => ({
  useSettingsDrawerSession: () => ({ open: false }),
}))
vi.mock("../../../../modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))
vi.mock("../../../../utils/notebooks/notebookAIBridge", () => ({
  signalUserEdit: vi.fn(),
}))

const cellId = "chart-cell"
const query = "SELECT ts, station, reading FROM observations"
const sibling = "SELECT ts, station, reading FROM other"
const noOp = () => undefined
const heatmap = {
  type: "heatmap" as const,
  partitionByColumn: "station",
  yColumns: ["reading"],
}
const dql = (
  query: string,
  dataset: (string | number | null)[][],
): SingleQueryResult => ({
  type: "dql",
  query,
  count: dataset.length,
  dataset,
  columns: [
    { name: "ts", type: "TIMESTAMP" },
    { name: "station", type: "SYMBOL" },
    { name: "reading", type: "DOUBLE" },
  ],
})
const makeCell = (
  results: SingleQueryResult[],
  queries = [heatmap] as NonNullable<NotebookCell["chartConfig"]>["queries"],
): NotebookCell => {
  fetchState.queries = results.map((r) => r.query)
  return {
    id: cellId,
    position: 0,
    type: "sql",
    mode: "draw",
    value: fetchState.queries.join("; "),
    chartConfig: { xColumn: "ts", queries },
    result: { timestamp: 1, activeResultIndex: 0, results },
  }
}

function Harness({
  cell,
  mounted = true,
}: {
  cell: NotebookCell
  mounted?: boolean
}) {
  const chartZoomed = useChartZoomed(cell.id)
  return (
    <>
      <CellViewToggle
        cellId={cell.id}
        chartZoomed={chartZoomed}
        paneLayout="result"
        view="chart"
        isGridLoading={false}
        isChartLoading={false}
        isCellBusy={false}
        showLabels={false}
        onResetZoomFocus={noOp}
      />
      {mounted && (
        <DrawCanvas
          cell={cell}
          isFocused
          refreshIntervalMs={100}
          onConfigChange={noOp}
          onRetryUnmountWhileFocused={noOp}
        />
      )}
    </>
  )
}

const setCanvasSize = () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    })),
  )
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640)
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(260)
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 640, 260),
  )
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/png;base64,",
  )
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      return new Proxy(
        {
          canvas: this,
          measureText: (text: string) => ({ width: text.length * 7 }),
          createImageData: (width: number, height: number) => ({
            width,
            height,
            data: new Uint8ClampedArray(width * height * 4),
          }),
          createLinearGradient: () => ({ addColorStop() {} }),
        },
        { get: (target, key) => (Reflect.get(target, key) as unknown) ?? noOp },
      ) as unknown as CanvasRenderingContext2D
    },
  )
}

const chartFromDOM = () => {
  const host = document.querySelector<HTMLDivElement>(".echarts-for-react")
  return host ? echarts.getInstanceByDom(host) : undefined
}
const readyChart = () =>
  waitFor(() => {
    const chart = chartFromDOM()
    if (!chart?.getOption()?.dataZoom) throw new Error("Chart not ready")
    return chart
  })

afterEach(() => clearChartZoom(cellId))

describe("notebook heatmap", () => {
  it("keeps the explicit Q2 heatmap when Q1 gains compatible rows, but does not choose between two heatmaps", async () => {
    setCanvasSize()
    const observations = dql(query, [
      [1000, "west", 1],
      [2000, "west", 2],
    ])
    const populated = dql(sibling, [[1000, "west", 9]])
    const config = [{ type: "line" as const, yColumns: ["reading"] }, heatmap]
    const view = renderComponent(
      <Harness cell={makeCell([dql(sibling, []), observations], config)} />,
    )
    const chart = await readyChart()
    const series = chart.getOption().series
    expect(series).toMatchObject([
      {
        type: "custom",
        data: [
          [0, 0, 1, 1],
          [1, 0, 2, 2],
        ],
      },
    ])

    view.rerender(
      <Harness cell={makeCell([populated, observations], config)} />,
    )
    expect(screen.getByRole("status")).toHaveTextContent(
      /Include only one query/,
    )
    expect(
      screen.getByText(/Include only one query/, { selector: "div" }),
    ).toBeVisible()
    expect(chartFromDOM()).toBe(chart)
    expect(chart.getOption().series).toEqual(series)

    const categoricalSibling = {
      ...populated,
      columns: [
        { name: "bucket", type: "SYMBOL" },
        { name: "station", type: "SYMBOL" },
        { name: "reading", type: "DOUBLE" },
      ],
      dataset: [["A", "west", 9]],
    }
    view.rerender(
      <Harness
        cell={makeCell([categoricalSibling, observations], [heatmap, heatmap])}
      />,
    )
    expect(screen.getByRole("status")).toHaveTextContent(
      /Include only one query/,
    )
    expect(chart.isDisposed()).toBe(true)
  })

  it.each([false, true])(
    "rejects duplicate cells regardless of reading order (reversed: %s)",
    (reversed) => {
      setCanvasSize()
      const readings = reversed ? [10, 90] : [90, 10]
      const cell = makeCell([
        dql(
          query,
          readings.map((value) => [1000, "west", value]),
        ),
      ])
      renderComponent(<Harness cell={cell} />)
      expect(screen.getByRole("status")).toHaveTextContent(
        /Aggregate the query to one reading/,
      )
      expect(
        screen.getByText(/Aggregate the query to one reading/, {
          selector: "div",
        }),
      ).toBeVisible()
      expect(chartFromDOM()).toBeUndefined()
    },
  )

  it("retains independent X/Y windows across DrawCanvas eviction and resets both", async () => {
    setCanvasSize()
    const cell = makeCell([
      dql(
        query,
        Array.from({ length: 200 }, (_, i) => [i * 1000, `station ${i}`, i]),
      ),
    ])
    const view = renderComponent(<Harness cell={cell} />)
    const first = await readyChart()
    const zoom = (id: string, start: number, end: number) =>
      act(() =>
        first.dispatchAction({ type: "dataZoom", dataZoomId: id, start, end }),
      )
    zoom(Y_SLIDER_ZOOM_ID, 20, 80)
    expect(getChartZoom(cell.id)).toEqual({ y: { start: 20, end: 80 } })
    expect(screen.getByRole("button", { name: "Reset zoom" })).toBeVisible()
    zoom(X_WHEEL_ZOOM_ID, 30, 90)
    expect(getChartZoom(cell.id)).toEqual({
      x: { start: 30, end: 90 },
      y: { start: 20, end: 80 },
    })

    view.rerender(<Harness cell={cell} mounted={false} />)
    expect(first.isDisposed()).toBe(true)
    view.rerender(<Harness cell={cell} />)
    const next = await readyChart()
    const windowFor = (id: string) =>
      (
        next.getOption().dataZoom as {
          id: string
          start: number
          end: number
        }[]
      ).find((z) => z.id === id)
    expect(windowFor(X_WHEEL_ZOOM_ID)).toMatchObject({ start: 30, end: 90 })
    expect(windowFor(Y_SLIDER_ZOOM_ID)).toMatchObject({ start: 20, end: 80 })

    act(() =>
      next.dispatchAction({
        type: "dataZoom",
        dataZoomId: X_WHEEL_ZOOM_ID,
        start: 0,
        end: 100,
      }),
    )
    expect(getChartZoom(cell.id)).toEqual({ y: { start: 20, end: 80 } })
    expect(windowFor(Y_SLIDER_ZOOM_ID)).toMatchObject({ start: 20, end: 80 })
    act(() =>
      next.dispatchAction({
        type: "dataZoom",
        dataZoomId: X_WHEEL_ZOOM_ID,
        start: 30,
        end: 90,
      }),
    )
    expect(windowFor(X_WHEEL_ZOOM_ID)).toMatchObject({ start: 30, end: 90 })
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }))
    expect(windowFor(X_WHEEL_ZOOM_ID)).toMatchObject({ start: 0, end: 100 })
    expect(windowFor(Y_SLIDER_ZOOM_ID)).toMatchObject({ start: 0, end: 100 })
    expect(getChartZoom(cell.id)).toBeUndefined()
    expect(
      screen.queryByRole("button", { name: "Reset zoom" }),
    ).not.toBeInTheDocument()
  })
})
