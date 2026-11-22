// @vitest-environment jsdom
import React from "react"
import { act, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import type { CellResult, NotebookCell } from "../../../../store/notebook"
import { clearRenderReport } from "../renderReports"
import { serializeCell } from "../../../../utils/ai/notebookSnapshot"

const BUFFER_ID = 46

vi.mock("../cellRefresh/CellRefreshContext", async (orig) => {
  const actual = await orig<Record<string, unknown>>()
  const engine = await import("../cellRefresh/cellRefreshEngine")
  return {
    ...actual,
    // A settled fetch for the cell's current SQL (settledKey === queriesKey).
    useCellFetchSelector: (_id: string, select: (s: unknown) => unknown) => {
      const g = globalThis as unknown as { __sql: string }
      const s = engine.pendingCellFetchState(g.__sql)
      return select({ ...s, settledKey: s.queriesKey })
    },
  }
})
vi.mock("../cells/useChartLoading", () => ({
  useChartLoading: () => ({ loading: false, stopVisible: false }),
}))
const actions = {
  setVariableValues: () => undefined,
  updateSettings: () => undefined,
  getVariables: () => [],
}
const state = { settings: {} }
vi.mock("../NotebookProvider", () => ({
  useNotebookActions: () => actions,
  useNotebookBufferId: () => 46,
  useNotebookState: () => state,
}))
vi.mock("../CellChart/lazyCharts", () => ({
  ChartSuspense: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  LazyChartRenderer: React.forwardRef(() => <div data-hook="stub-chart" />),
  LazyCustomChart: () => <div />,
  LazyVisualCanvas: () => <div />,
  preloadChartCode: () => undefined,
}))
vi.mock("../CellChart/DrawSettingsDrawer", () => ({
  DrawSettingsDrawer: () => null,
}))

import { DrawCanvas } from "./index"

const SQL = "SELECT ts, price FROM trades WHERE ts > dateadd('h', -1, now())"

const dql = (rows: number): CellResult => ({
  results: [
    {
      type: "dql",
      query: SQL,
      columns: [
        { name: "ts", type: "TIMESTAMP" },
        { name: "price", type: "DOUBLE" },
      ],
      dataset: Array.from({ length: rows }, (_, i) => [
        `2026-01-01T00:0${i}:00.000000Z`,
        100 + i,
      ]),
      count: rows,
      fetchedAt: 1,
    },
  ],
  activeResultIndex: 0,
  timestamp: rows + 1,
})

const failed: CellResult = {
  results: [{ type: "error", query: SQL, error: "table does not exist" }],
  activeResultIndex: 0,
  timestamp: 99,
} as unknown as CellResult

const cellWith = (result: CellResult): NotebookCell => ({
  id: "c1",
  position: 0,
  value: SQL,
  mode: "draw",
  result,
})

const ui = (cell: NotebookCell) => (
  <DrawCanvas
    cell={cell}
    isFocused={false}
    refreshIntervalMs={undefined}
    onSettingsChange={() => undefined}
    onRetryUnmountWhileFocused={() => undefined}
  />
)

const getCell = (cell: NotebookCell) =>
  serializeCell([cell], cell.id, BUFFER_ID, false, undefined, "loaded")

afterEach(() => clearRenderReport(BUFFER_ID, "c1"))

describe("DrawCanvas render report", () => {
  it.each([
    ["no rows", dql(0), "No data to plot.", "warning"],
    [
      "a failed statement",
      failed,
      "Query failed: check the SQL editor for the error.",
      "error",
    ],
  ] as const)(
    "replaces the previous draw's report when a re-run settles with %s",
    (_label, next, message, severity) => {
      ;(globalThis as unknown as { __sql: string }).__sql = SQL
      const first = cellWith(dql(5))
      const { rerender } = renderComponent(ui(first))
      expect(getCell(first).render_report?.drawn).toEqual({
        series: 1,
        points: 5,
        events: 0,
      })

      const second = cellWith(next)
      act(() => {
        rerender(ui(second))
      })
      expect(screen.getAllByText(message).length).toBeGreaterThan(0)
      const report = getCell(second).render_report
      expect(report?.kind).toBe("chart")
      expect(report?.drawn).toEqual({})
      expect(report?.problems).toEqual([{ message, severity }])
    },
  )
})
