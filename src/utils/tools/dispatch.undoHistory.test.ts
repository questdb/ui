import "../../test/stubBrowserGlobals"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NotebookCell } from "../../store/notebook"
import {
  __resetNotebookUndoHistoryForTests,
  onUndoHistoryCleared,
  peekUndoEntry,
  recordUndoEntry,
} from "../../scenes/Editor/Notebook/undo/notebookUndoHistory"
import { __resetNotebookAIBridgeForTests } from "../notebooks/notebookAIBridge"
import {
  __resetNotebookControllerForTests,
  __resetNotebookDexieControllerForTests,
} from "../notebooks/notebookController"
import { __resetNotebookBufferQueuesForTests } from "../notebooks/notebookBufferQueue"
import { db } from "../../store/db"
import type { Permissions } from "./permissions"
import { dispatchTool } from "./dispatch"

const BUFFER_ID = 5
const ALL_GRANTED: Permissions = {
  grantSchemaAccess: true,
  read: true,
  write: true,
}
const dqlValidator = () =>
  Promise.resolve({ query: "", columns: [], timestamp: 0 })

const cell = (id: string): NotebookCell => ({
  id,
  position: 0,
  value: `SELECT '${id}'`,
})

const runAgentTool = (name: string, input: Record<string, unknown>) =>
  dispatchTool(
    name,
    input,
    {} as Parameters<typeof dispatchTool>[2],
    () => undefined,
    ALL_GRANTED,
    dqlValidator,
  )

beforeEach(async () => {
  __resetNotebookAIBridgeForTests()
  __resetNotebookUndoHistoryForTests()
  __resetNotebookControllerForTests()
  __resetNotebookDexieControllerForTests()
  __resetNotebookBufferQueuesForTests()
  await db.buffers.clear()
  await db.buffers.put({
    id: BUFFER_ID,
    label: "Notebook",
    value: "",
    position: 0,
    notebookViewState: { cells: [cell("a"), cell("b"), cell("c")] },
  })
})

describe("dispatch: the user's undo history after an agent edit", () => {
  it.each([
    ["delete_cell", { buffer_id: BUFFER_ID, cell_id: "b" }],
    ["move_cell_down", { buffer_id: BUFFER_ID, cell_id: "a" }],
    ["set_cell_mode", { buffer_id: BUFFER_ID, cell_id: "a", mode: "run" }],
    [
      "apply_notebook_state",
      {
        buffer_id: BUFFER_ID,
        cells: ["b", "a", "c"].map((id) => ({
          id,
          preserve_value: true,
          view: "editor",
        })),
      },
    ],
  ])("%s clears it and closes its undo toast", async (tool, input) => {
    // Given a user change on the notebook's undo history, with its toast
    recordUndoEntry(BUFFER_ID, {
      change: "remove",
      placements: [{ cell: cell("x"), index: 3, afterCellId: "c" }],
    })
    const closeToast = vi.fn()
    onUndoHistoryCleared(BUFFER_ID, closeToast)

    // When an agent tool changes the notebook
    const response = await runAgentTool(tool, input)

    // Then the history the edit may have broken is gone, and so is the toast
    expect(response.is_error).toBeFalsy()
    expect(peekUndoEntry(BUFFER_ID)).toBeUndefined()
    expect(closeToast).toHaveBeenCalledTimes(1)
  })

  it("keeps the history when the agent's transition is rejected", async () => {
    recordUndoEntry(BUFFER_ID, {
      change: "remove",
      placements: [{ cell: cell("x"), index: 3, afterCellId: "c" }],
    })
    const before = peekUndoEntry(BUFFER_ID)
    const closeToast = vi.fn()
    onUndoHistoryCleared(BUFFER_ID, closeToast)
    const response = await runAgentTool("delete_cell", {
      buffer_id: BUFFER_ID,
      cell_id: "unknown",
    })
    expect(response.is_error).toBe(true)
    expect(peekUndoEntry(BUFFER_ID)).toBe(before)
    expect(closeToast).not.toHaveBeenCalled()
  })
})
