// @vitest-environment jsdom
// Typing in one cell, or a result landing in it, must not re-render the grids
// and charts of the other cells: the real NotebookProvider, ResultGridPanel
// and DrawCanvas, under cell wrappers memoized like `Cell`.
import React, { Profiler } from "react"
import { act } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { renderComponent } from "../../../test/component"
import type { CellResult, NotebookCell } from "../../../store/notebook"

const counts = vi.hoisted(() => ({ chart: 0 }))

vi.mock("../../../providers/EditorProvider", () => ({
  useEditor: () => ({ updateBuffer: () => Promise.resolve() }),
}))

vi.mock("./CellChart/lazyCharts", () => ({
  ChartSuspense: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  LazyChartRenderer: React.forwardRef(() => {
    counts.chart++
    return <div data-hook="stub-chart" />
  }),
  LazyCustomChart: () => <div />,
  LazyVisualCanvas: () => <div />,
  preloadChartCode: () => undefined,
}))
vi.mock("./CellChart/DrawSettingsDrawer", () => ({
  DrawSettingsDrawer: () => null,
}))

vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => null,
  })
})

import {
  NotebookProvider,
  useNotebookActions,
  useNotebookState,
} from "./NotebookProvider"
import { ResultGridPanel } from "./result-table/ResultGridPanel"
import { createResultGridViewportStore } from "./result-table/resultGridViewportStore"
import { DrawCanvas } from "./DrawCanvas"

const SQL = "select ts, price from trades"
const columns = [
  { name: "ts", type: "TIMESTAMP" },
  { name: "price", type: "DOUBLE" },
]
const result = (seed: number): CellResult => ({
  results: [
    {
      type: "dql",
      query: SQL,
      columns,
      dataset: Array.from({ length: 5 }, (_, i) => [
        `2026-01-01T00:0${i}:00.000000Z`,
        seed + i,
      ]),
      count: 5,
      fetchedAt: seed,
    },
  ],
  activeResultIndex: 0,
  timestamp: seed,
})

const cells: NotebookCell[] = [
  { id: "A", position: 0, value: SQL, result: result(1) },
  { id: "B", position: 1, value: SQL, result: result(2) },
  {
    id: "C",
    position: 2,
    value: SQL,
    mode: "draw",
    result: result(3),
    chartConfig: {
      xColumn: "ts",
      queries: [{ type: "line", yColumns: ["price"] }],
    },
  } as unknown as NotebookCell,
]

const renders: Record<string, number> = {}
const onRender = (id: string) => {
  renders[id] = (renders[id] ?? 0) + 1
}
const viewportStore = createResultGridViewportStore()
const noop = () => undefined

// Mirrors `Cell = React.memo(CellInner)`: re-renders only on prop change.
const CellLike = React.memo(function CellLike({
  cell,
}: {
  cell: NotebookCell
}) {
  const data = cell.result?.results[0]
  if (cell.mode === "draw")
    return (
      <Profiler id={`draw-${cell.id}`} onRender={onRender}>
        <DrawCanvas
          cell={cell}
          isFocused={false}
          refreshIntervalMs={undefined}
          {...({
            onSettingsChange: noop,
            onConfigChange: noop,
          } as unknown as { onSettingsChange: () => void })}
          onRetryUnmountWhileFocused={noop}
        />
      </Profiler>
    )
  if (!data || data.type !== "dql") return null
  return (
    <Profiler id={`grid-${cell.id}`} onRender={onRender}>
      <ResultGridPanel
        data={data}
        statementKey="s0"
        runToken={1}
        cellId={cell.id}
        bufferId={46}
        isFocused={false}
        isRunning={false}
        onReRun={noop}
        onYieldFocus={noop}
        cellColumns={columns}
        viewportStore={viewportStore}
        highlightConfig={undefined}
        refreshIntervalMs={undefined}
      />
    </Profiler>
  )
})

const actionsRef: { current: ReturnType<typeof useNotebookActions> | null } = {
  current: null,
}
const List = () => {
  const { cells } = useNotebookState()
  actionsRef.current = useNotebookActions()
  return (
    <>
      {cells.map((cell) => (
        <CellLike key={cell.id} cell={cell} />
      ))}
    </>
  )
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 800, 600),
  )
})

const snapshot = () => ({
  gridB: renders["grid-B"] ?? 0,
  drawC: renders["draw-C"] ?? 0,
  chart: counts.chart,
})

const settle = async () => {
  for (let i = 0; i < 5; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
}

it("re-renders no other cell's grid or chart when one cell is typed in or refreshed", async () => {
  // Given a notebook with two grid cells and a chart cell
  renderComponent(
    <NotebookProvider
      bufferId={46}
      preview
      initialState={{ cells, settings: {} } as never}
    >
      <List />
    </NotebookProvider>,
  )
  await settle()
  const before = snapshot()
  expect(before.gridB).toBeGreaterThan(0)

  // When the user types in the first cell, then its refresh lands
  for (let i = 0; i < 5; i++) {
    act(() => {
      actionsRef.current!.updateCell("A", {
        value: `${SQL} ${"x".repeat(i + 1)}`,
      })
    })
  }
  act(() => {
    actionsRef.current!.updateCell("A", { result: result(100) })
  })
  await settle()

  // Then the other cells' grid and chart did not render again
  expect(snapshot()).toEqual(before)
})
