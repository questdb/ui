// @vitest-environment jsdom
import React from "react"
import { act, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../test/component"
import type { NotebookCell } from "../../../store/notebook"
import {
  NotebookProvider,
  useNotebookActions,
  useNotebookState,
  type NotebookActions,
} from "./NotebookProvider"
import {
  __resetNotebookUndoHistoryForTests,
  recordUndoEntry,
} from "./undo/notebookUndoHistory"

// The provider's own wiring of delete and undo, with storage replaced: the
// snapshot index, the document writes and the column layouts.
const storage = vi.hoisted(() => ({
  snapshotCellIds: [] as string[],
  deleteCellSnapshot: vi.fn(() => Promise.resolve()),
  removeNotebookCellLayouts: vi.fn(),
}))

vi.mock("../../../store/notebookResults", () => ({
  loadSnapshotCellIds: () => Promise.resolve(storage.snapshotCellIds),
  deleteCellSnapshot: storage.deleteCellSnapshot,
  loadCellSnapshot: () => Promise.resolve(undefined),
  copyNotebookSnapshots: () => Promise.resolve(0),
  pinNotebookSnapshots: vi.fn(),
  pruneToRecentNotebooks: () => Promise.resolve(),
}))
vi.mock("./useNotebookPersistence", () => ({
  useNotebookPersistence: () => ({
    persistCells: () => Promise.resolve(),
    persistImmediately: () => Promise.resolve(),
    persistDebounced: () => undefined,
  }),
}))
vi.mock("./notebookColumnLayoutStore", async (importActual) => ({
  ...(await importActual<typeof import("./notebookColumnLayoutStore")>()),
  removeNotebookCellLayouts: storage.removeNotebookCellLayouts,
}))

const BUFFER_ID = 41

const cell = (id: string): NotebookCell => ({
  id,
  position: 0,
  value: `SELECT '${id}'`,
})

const probe: { actions?: NotebookActions; cellIds?: string[] } = {}

const Probe = () => {
  probe.actions = useNotebookActions()
  probe.cellIds = useNotebookState().cells.map((c) => c.id)
  return null
}

const mountNotebook = (cells: NotebookCell[]) =>
  renderComponent(
    <NotebookProvider bufferId={BUFFER_ID} initialState={{ cells }}>
      <Probe />
    </NotebookProvider>,
  )

beforeEach(() => {
  __resetNotebookUndoHistoryForTests()
  storage.snapshotCellIds = []
  storage.deleteCellSnapshot.mockClear()
  storage.removeNotebookCellLayouts.mockClear()
})

describe("NotebookProvider undo wiring", () => {
  it("brings a deleted cell back with the same id and its stored result", () => {
    // Given a notebook with three cells
    mountNotebook([cell("a"), cell("b"), cell("c")])

    // When the user deletes the middle cell
    act(() => probe.actions?.deleteCell("b"))

    // Then it leaves the notebook, but its stored result and column layout
    // stay for the undo
    expect(probe.cellIds).toEqual(["a", "c"])
    expect(storage.deleteCellSnapshot).not.toHaveBeenCalled()
    expect(storage.removeNotebookCellLayouts).not.toHaveBeenCalled()

    // And when the user undoes it
    let step: ReturnType<NotebookActions["undo"]> | undefined
    act(() => {
      step = probe.actions?.undo()
    })

    // Then the same cell is back in its place, so its result loads again
    expect(step).toEqual({ kind: "inserted", cellIds: ["b"] })
    expect(probe.cellIds).toEqual(["a", "b", "c"])
  })

  it("keeps the stored results of a cell the undo history holds on mount", async () => {
    // Given a deleted cell "held" that undo can still bring back, and a cell
    // "gone" that nothing refers to, both with stored results
    recordUndoEntry(BUFFER_ID, {
      change: "remove",
      placements: [{ cell: cell("held"), index: 1, afterCellId: "a" }],
      variables: [],
    })
    storage.snapshotCellIds = ["a", "held", "gone"]

    // When the notebook mounts and reconciles its stored results
    mountNotebook([cell("a")])

    // Then only the result nothing refers to is deleted
    await waitFor(() =>
      expect(storage.deleteCellSnapshot).toHaveBeenCalledWith(
        BUFFER_ID,
        "gone",
      ),
    )
    expect(storage.deleteCellSnapshot).not.toHaveBeenCalledWith(
      BUFFER_ID,
      "held",
    )
    expect(storage.removeNotebookCellLayouts).not.toHaveBeenCalledWith(
      BUFFER_ID,
      "held",
    )
  })
})
