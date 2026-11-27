// @vitest-environment jsdom
import React, { useState } from "react"
import { act, fireEvent, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { queryHook, renderComponent } from "../../../../test/component"
import type { CellResult, NotebookCell } from "../../../../store/notebook"
import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import {
  CellRefreshEngine,
  type CellRefreshDeps,
} from "../cellRefresh/cellRefreshEngine"
import { CellRefreshProvider } from "../cellRefresh/CellRefreshContext"
import { createRequestLimiter } from "../../../../utils/questdb/requestLimiter"
import { DrawCanvas } from "."

const actions = vi.hoisted(() => ({ updateCell: vi.fn() }))
vi.mock("../NotebookProvider", async (importActual) => ({
  ...(await importActual<typeof import("../NotebookProvider")>()),
  useNotebookActions: () => actions,
}))
vi.mock("../../../../modules/ConsoleEventTracker", () => ({
  trackEvent: () => Promise.resolve(),
}))
vi.mock("../persistCellSnapshot", () => ({
  persistCellSnapshot: () => Promise.resolve(true),
}))
vi.mock("../../../../store/notebookResults", () => ({
  deleteCellSnapshot: () => Promise.resolve(),
}))
vi.mock("../CellChart/ChartRenderer", () => ({
  ChartRenderer: () => <div data-hook="chart-renderer" />,
}))

const SQL = "select ts, v from t where ts > dateadd('h', -1, now())"

const zeroRows = (query: string): QueryExecResult => ({
  type: "dql",
  query,
  columns: [
    { name: "ts", type: "TIMESTAMP" },
    { name: "v", type: "DOUBLE" },
  ],
  dataset: [],
  count: 0,
})

// A "Save chart to notebook" cell whose captured frame is no longer available.
const transferred: NotebookCell = {
  id: "c1",
  position: 0,
  value: SQL,
  mode: "draw",
  autoRefresh: false,
  chartConfig: { xColumn: null, queries: [null] },
  deferInitialDraw: true,
}

const setup = () => {
  const results = new Map<string, CellResult | undefined>()
  let publishResult: (result: CellResult | undefined) => void = () => {}
  const executeSingle = vi.fn((sql: string) => Promise.resolve(zeroRows(sql)))
  const deps: CellRefreshDeps = {
    executeSingle,
    validateWithGlobals: () =>
      Promise.resolve({ query: "q", columns: [], timestamp: 0 }),
    setCellResult: (id, result) => {
      results.set(id, result)
      publishResult(result)
    },
    getCellResult: (id) => results.get(id),
    isDrawCell: () => true,
    isCellRunning: () => false,
    resultLoadStatus: () => "missing",
    subscribeResultLoad: () => () => {},
    requestResultLoad: () => {},
    noteResultMissing: () => {},
    reviveResultLoad: () => {},
    onSnapshotPersisted: () => {},
  }
  const engine = new CellRefreshEngine(1, () => deps, {
    initialFetchJitterMs: 0,
    requestLimiter: createRequestLimiter(8),
  })
  engine.attach()

  // Owns the cell the way NotebookProvider does.
  const Harness = () => {
    const [cell, setCell] = useState<NotebookCell>(transferred)
    publishResult = (result) => setCell((prev) => ({ ...prev, result }))
    actions.updateCell.mockImplementation(
      (_id: string, patch: Partial<NotebookCell>) =>
        setCell((prev) => ({ ...prev, ...patch })),
    )
    return (
      <CellRefreshProvider value={engine}>
        <DrawCanvas
          cell={cell}
          isFocused={false}
          refreshIntervalMs={undefined}
          onConfigChange={() => {}}
          onRetryUnmountWhileFocused={() => {}}
        />
      </CellRefreshProvider>
    )
  }
  renderComponent(<Harness />)
  return { engine, executeSingle }
}

const visibleNoData = () =>
  screen
    .queryAllByText("No data to plot.")
    .some((el) => el.getAttribute("role") !== "status")

describe("DrawCanvas transferred chart", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("waits for Draw, then behaves as an ordinary chart", async () => {
    const { engine, executeSingle } = setup()
    await act(async () => {
      engine.setVisible("c1", true)
      engine.sync([transferred])
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(executeSingle).not.toHaveBeenCalled()
    expect(queryHook("draw-canvas-transferred")).not.toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Draw" }))
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(executeSingle).toHaveBeenCalledTimes(1)
    expect(actions.updateCell).toHaveBeenCalledWith("c1", {
      deferInitialDraw: undefined,
    })
    expect(queryHook("draw-canvas-transferred")).toBeNull()
    expect(visibleNoData()).toBe(true)
    engine.destroy()
  })
})
