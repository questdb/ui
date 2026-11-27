import { beforeEach, describe, expect, it, vi } from "vitest"
import * as notebookControllers from "../../utils/notebooks/notebookController"
import type {
  NotebookController,
  RunCellSummary,
} from "../../utils/notebooks/notebookController"
import { NotebookToolError } from "../../utils/notebooks/notebookToolError"
import { runCellsAutomatically } from "./notebookOpeners"

const toastError = vi.hoisted(() => vi.fn())
vi.mock("../../components/Toast", () => ({
  toast: { error: toastError, success: vi.fn(), info: vi.fn() },
}))

const ran = (): RunCellSummary => ({
  success: true,
  queryCount: 1,
  results: ["OK"],
})
const denied = (): RunCellSummary => ({
  success: false,
  queryCount: 0,
  results: [],
  denied: "could not classify SQL",
})

// Each cell's run outcome, by cell id.
const bindNotebook = (
  outcomes: Record<string, () => Promise<RunCellSummary>>,
) => {
  const runCell = vi.fn((cellId: string) => outcomes[cellId]())
  vi.spyOn(notebookControllers, "withBoundNotebook").mockImplementation(
    (bufferId, run) =>
      run({ bufferId, kind: "live", runCell } as unknown as NotebookController),
  )
  return runCell
}

describe("runCellsAutomatically", () => {
  beforeEach(() => {
    toastError.mockReset()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  it("runs every cell through the auto-run gate", async () => {
    // Given two cells that run
    const runCell = bindNotebook({
      a: () => Promise.resolve(ran()),
      b: () => Promise.resolve(ran()),
    })

    // When they are run automatically
    await runCellsAutomatically(1, ["a", "b"])

    // Then both ran gated, as user runs, and nothing is reported
    expect(runCell).toHaveBeenCalledWith("a", undefined, undefined, {
      kind: "autoRun",
      initiator: "user",
    })
    expect(runCell).toHaveBeenCalledWith("b", undefined, undefined, {
      kind: "autoRun",
      initiator: "user",
    })
    expect(toastError).not.toHaveBeenCalled()
  })

  it("keeps going after a failed or refused cell and reports how many did not run", async () => {
    // Given a cell that fails and a cell the gate refuses before a good one
    const runCell = bindNotebook({
      a: () => Promise.reject(new Error("network")),
      b: () => Promise.resolve(denied()),
      c: () => Promise.resolve(ran()),
    })

    // When they are run automatically
    await runCellsAutomatically(1, ["a", "b", "c"])

    // Then the last cell still ran, and the user is told about the other two
    expect(runCell).toHaveBeenCalledTimes(3)
    expect(toastError).toHaveBeenCalledWith(
      "2 cells could not be run automatically. Run them from the notebook.",
    )
  })

  it("skips a cell deleted meanwhile without reporting it", async () => {
    // Given a cell the user deleted while an earlier one ran
    const runCell = bindNotebook({
      a: () => Promise.reject(new NotebookToolError("unknown_cell", "gone")),
      b: () => Promise.resolve(ran()),
    })

    // When the cells are run automatically
    await runCellsAutomatically(1, ["a", "b"])

    // Then the next cell runs and nothing is reported
    expect(runCell).toHaveBeenCalledTimes(2)
    expect(toastError).not.toHaveBeenCalled()
  })

  it("stops quietly when the notebook is closed meanwhile", async () => {
    // Given a notebook closed while its first cell runs
    const runCell = bindNotebook({
      a: () => Promise.reject(new NotebookToolError("archived", "closed")),
      b: () => Promise.resolve(ran()),
    })

    // When the cells are run automatically
    await runCellsAutomatically(1, ["a", "b"])

    // Then no other cell runs and nothing is reported
    expect(runCell).toHaveBeenCalledTimes(1)
    expect(toastError).not.toHaveBeenCalled()
  })
})
