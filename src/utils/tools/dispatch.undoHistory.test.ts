import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NotebookCell } from "../../store/notebook"
import {
  __resetNotebookUndoHistoryForTests,
  onUndoHistoryCleared,
  peekUndoEntry,
  recordUndoEntry,
} from "../../scenes/Editor/Notebook/undo/notebookUndoHistory"
import { __resetNotebookAIBridgeForTests } from "../notebooks/notebookAIBridge"
import type { ViewParts } from "../notebooks/notebookController"
import type { Permissions } from "./permissions"
import { dispatchTool } from "./dispatch"

const notebook = vi.hoisted(() => ({ parts: null as ViewParts | null }))

// A bound notebook whose controller applies each transition to
// `notebook.parts`, as the live controller does to the mounted notebook.
vi.mock("../notebooks/notebookController", async (importActual) => ({
  ...(await importActual<typeof import("../notebooks/notebookController")>()),
  withBoundNotebook: <T>(
    _bufferId: number,
    fn: (controller: {
      mutate: (
        transition: (parts: ViewParts) => { parts: ViewParts; result: T },
      ) => Promise<T>
    }) => Promise<T>,
  ) =>
    fn({
      mutate: (transition) => {
        const applied = transition(notebook.parts as ViewParts)
        notebook.parts = applied.parts
        return Promise.resolve(applied.result)
      },
    }),
}))

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

beforeEach(() => {
  __resetNotebookAIBridgeForTests()
  __resetNotebookUndoHistoryForTests()
  notebook.parts = {
    cells: [cell("a"), cell("b"), cell("c")],
    settings: {},
    maximizedCellId: null,
    focusedCellId: null,
  }
})

describe("dispatch: the user's undo history after an agent edit", () => {
  it.each([
    ["delete_cell", { buffer_id: BUFFER_ID, cell_id: "b" }],
    ["move_cell_down", { buffer_id: BUFFER_ID, cell_id: "a" }],
  ])("%s clears it and closes its undo toast", async (tool, input) => {
    // Given a user change on the notebook's undo history, with its toast
    recordUndoEntry(BUFFER_ID, {
      change: "remove",
      placements: [{ cell: cell("x"), index: 3, afterCellId: "c" }],
      variables: [],
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
})
