import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { NotebookCell } from "../../../store/notebook"
import type { MonitoringSource } from "../../../utils/monitoring/types"
import type { RunCellSummary } from "../../../utils/notebooks/notebookController"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"
import { useMonitoringAutoRun } from "./useMonitoringAutoRun"

const mocks = vi.hoisted(() => ({
  cells: [] as NotebookCell[],
  runCell: vi.fn<
    [string, AbortSignal | undefined, string | undefined, unknown],
    Promise<RunCellSummary>
  >(),
  snapshotIds: [] as string[],
  error: vi.fn(),
}))
vi.mock("../../../utils/notebooks/notebookController", () => ({
  waitForController: () =>
    Promise.resolve({
      readView: () => Promise.resolve({ cells: mocks.cells }),
      runCell: mocks.runCell,
    }),
}))
vi.mock("../../../store/notebookResults", () => ({
  loadSnapshotCellIds: () => Promise.resolve(mocks.snapshotIds),
}))
vi.mock("../../../utils/notebooks/notebookTransferState", () => ({
  hasTransferSnapshot: () => false,
}))
vi.mock("../../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
vi.mock("../../../components/Toast", () => ({ toast: { error: mocks.error } }))

const monitoring: MonitoringSource = {
  target: { instanceKey: "db", kind: "table", name: "trades" },
  templateVersion: 1,
  initialFingerprint: "f",
}
const cell = (id: string, patch: Partial<NotebookCell> = {}): NotebookCell => ({
  id,
  position: 0,
  value: `select '${id}'`,
  ...patch,
})
const success: RunCellSummary = { success: true, queryCount: 1, results: [] }
const failed: RunCellSummary = { success: false, queryCount: 1, results: [] }

let renderer: ReactTestRenderer | undefined
const mount = async (source: MonitoringSource | undefined) => {
  const Harness = () => {
    useMonitoringAutoRun(7, source, true)
    return null
  }
  await act(async () => {
    renderer = create(<Harness />)
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.snapshotIds = []
  mocks.runCell.mockResolvedValue(success)
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

describe("monitoring dashboard auto-run", () => {
  it("runs only never-run grid cells, in parallel, through the auto-run gate", async () => {
    mocks.cells = [
      cell("fresh"),
      cell("interrupted", { lastRunStatus: "cancelled" }),
      cell("stopped", { lastRunStatus: "cancelled" }),
      cell("ran", { lastRunStatus: "success" }),
      cell("shown", {
        result: { results: [], activeResultIndex: 0, timestamp: 1 },
      }),
      cell("chart", { mode: "draw" }),
      cell("notes", { type: "markdown", value: "# Notes" }),
    ]
    mocks.snapshotIds = ["stopped"]
    mocks.runCell.mockReturnValue(new Promise(() => {}))
    await mount(monitoring)

    expect(mocks.runCell.mock.calls.map(([id]) => id)).toEqual([
      "fresh",
      "interrupted",
    ])
    for (const [, signal, sql, gate] of mocks.runCell.mock.calls) {
      expect(signal).toBeInstanceOf(AbortSignal)
      expect(sql).toBeUndefined()
      expect(gate).toEqual({ kind: "autoRun", source: "monitoring" })
    }
  })

  it("never runs SQL in an edited dashboard or a regular notebook", async () => {
    mocks.cells = [cell("fresh")]
    await mount({ ...monitoring, customizedAt: 1 })
    act(() => renderer?.unmount())
    await mount(undefined)
    expect(mocks.runCell).not.toHaveBeenCalled()
  })

  it("aborts its runs when the dashboard unmounts", async () => {
    mocks.cells = [cell("fresh")]
    mocks.runCell.mockReturnValue(new Promise(() => {}))
    await mount(monitoring)
    const signal = mocks.runCell.mock.calls[0][1]!
    act(() => renderer?.unmount())
    renderer = undefined
    expect(signal.aborted).toBe(true)
  })

  it("reports failed cells, but not interrupted ones", async () => {
    mocks.cells = [cell("health"), cell("partitions"), cell("left")]
    mocks.runCell.mockImplementation((id) =>
      Promise.resolve<RunCellSummary>(
        id === "health"
          ? { ...failed, denied: "private table" }
          : id === "partitions"
            ? failed
            : { ...failed, cancelled: "cancelled" },
      ),
    )
    await mount(monitoring)

    expect(mocks.error).toHaveBeenCalledWith(
      "2 monitoring cells could not run. Check their errors in the notebook.",
    )
    expect(trackEvent).toHaveBeenCalledWith(
      ConsoleEvent.MONITORING_DASHBOARD_FAILED,
      {
        notebookId: 7,
        kind: "table",
        stage: "initial_query",
        reason: "permission_denied",
        cellId: "health",
        mode: "grid",
      },
    )
    expect(trackEvent).toHaveBeenCalledWith(
      ConsoleEvent.MONITORING_DASHBOARD_FAILED,
      expect.objectContaining({ reason: "query_error", cellId: "partitions" }),
    )
    expect(trackEvent).not.toHaveBeenCalledWith(
      ConsoleEvent.MONITORING_DASHBOARD_FAILED,
      expect.objectContaining({ cellId: "left" }),
    )
  })
})
