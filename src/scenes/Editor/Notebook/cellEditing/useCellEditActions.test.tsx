// @vitest-environment jsdom
import React from "react"
import { act, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import type { NotebookCell } from "../../../../store/notebook"
import type { NotebookActions } from "../NotebookProvider"
import type { CellClipboardPayload } from "./cellClipboardPayload"
import { useCellEditActions } from "./useCellEditActions"

const notebook = vi.hoisted(() => ({
  runCell: vi.fn(),
  pasteCells: vi.fn(),
  variables: [] as { name: string; value: string }[],
}))
const toast = vi.hoisted(() => ({
  info: vi.fn(),
  warning: vi.fn(),
  success: vi.fn(),
  dismiss: vi.fn(),
}))

vi.mock("../NotebookProvider", () => ({
  useNotebookActions: (): Partial<NotebookActions> => ({
    getCellsSnapshot: () => [{ id: "a", position: 0, value: "SELECT 1" }],
    getSettings: () => ({ variables: notebook.variables }),
    pasteCells: notebook.pasteCells,
    runCell: notebook.runCell,
    setFocusedCell: () => undefined,
  }),
  useNotebookBufferId: () => 1,
}))
vi.mock("../../../../components/Toast", () => ({ toast }))
vi.mock("../../../../modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))

const probe: { actions?: ReturnType<typeof useCellEditActions> } = {}

const Probe = () => {
  probe.actions = useCellEditActions()
  return null
}

const payloadOf = (cell: Partial<NotebookCell>): CellClipboardPayload => ({
  cells: [{ cell: { id: "copied", position: 0, value: "", ...cell } }],
})

const paste = (payload: CellClipboardPayload) =>
  act(() => probe.actions?.pasteCells(payload, "a", "button"))

describe("useCellEditActions paste", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    notebook.variables = []
    notebook.pasteCells.mockReturnValue(["pasted"])
    notebook.runCell.mockResolvedValue({ ok: true, superseded: false })
    renderComponent(<Probe />)
  })

  it("fetches a pasted cell's rows through the auto-run gate", () => {
    // Given a copied cell that has run, whose SQL writes
    const payload = payloadOf({
      value: "INSERT INTO t VALUES (1)",
      lastRunStatus: "success",
    })

    // When the user pastes it
    paste(payload)

    // Then it runs only through the auto-run gate, which never executes
    // DDL/DML, so the write is not repeated
    expect(notebook.runCell).toHaveBeenCalledTimes(1)
    expect(notebook.runCell).toHaveBeenCalledWith(
      "pasted",
      undefined,
      undefined,
      false,
      { kind: "autoRun", initiator: "user" },
    )
  })

  it("says why a pasted write was not run", async () => {
    // Given the auto-run gate skips the pasted cell's DDL/DML
    notebook.runCell.mockResolvedValue({
      ok: false,
      superseded: false,
      skipped: "contains DDL/DML",
    })

    // When the user pastes a run cell
    paste(payloadOf({ value: "DROP TABLE t", lastRunStatus: "success" }))

    // Then a toast tells the user it was not run
    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(
        "The pasted cell has DDL/DML statements, so it was not run.",
        expect.anything(),
      ),
    )
  })

  it("pastes a cell with missing variables, names them, and does not run it", () => {
    paste(payloadOf({ value: "SELECT @missing", lastRunStatus: "success" }))
    expect(notebook.pasteCells).toHaveBeenCalled()
    expect(notebook.runCell).not.toHaveBeenCalled()
    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining("@missing"),
      expect.anything(),
    )
  })

  it("leaves a chart with missing variables in the editor with its config", () => {
    const chartConfig = { xColumn: null, queries: [] }
    paste(
      payloadOf({
        mode: "draw",
        paneView: "result",
        value: "SELECT @absent",
        chartConfig,
      }),
    )
    const [, pasted] = notebook.pasteCells.mock.calls[0] as [
      string | undefined,
      CellClipboardPayload["cells"],
    ]
    expect(pasted[0].cell.mode).toBeUndefined()
    expect(pasted[0].cell.paneView).toBe("editor_result")
    expect(pasted[0].cell.chartConfig).toEqual(chartConfig)
    expect(notebook.runCell).not.toHaveBeenCalled()
  })

  it("matches destination variables ignoring case and keeps local declarations", () => {
    notebook.variables = [{ name: "Since", value: "1" }]
    paste(
      payloadOf({
        value:
          "DECLARE @local := @SINCE SELECT @LOCAL, '@not_a_variable' -- @comment",
        lastRunStatus: "success",
      }),
    )
    expect(notebook.runCell).toHaveBeenCalledTimes(1)
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it("runs only the cells whose variables are available in a mixed paste", () => {
    notebook.pasteCells.mockReturnValue(["missing", "ready"])
    const payload = payloadOf({
      value: "SELECT @absent",
      lastRunStatus: "success",
    })
    payload.cells.push(
      ...payloadOf({ value: "SELECT 1", lastRunStatus: "success" }).cells,
    )
    paste(payload)
    expect(notebook.runCell).toHaveBeenCalledTimes(1)
    expect(notebook.runCell).toHaveBeenCalledWith(
      "ready",
      undefined,
      undefined,
      false,
      { kind: "autoRun", initiator: "user" },
    )
  })

  it.each([
    ["a cell that never ran", { value: "SELECT 1" }],
    [
      "a markdown cell",
      { type: "markdown" as const, value: "# a", lastRunStatus: "success" },
    ],
    [
      "a chart cell",
      { mode: "draw" as const, value: "SELECT 1", lastRunStatus: "success" },
    ],
  ])("does not run %s", (_, cell) => {
    // When the user pastes it
    paste(payloadOf(cell as Partial<NotebookCell>))

    // Then nothing runs
    expect(notebook.runCell).not.toHaveBeenCalled()
  })
})
