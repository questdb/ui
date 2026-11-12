// @vitest-environment jsdom
import React from "react"
import { act, fireEvent, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../test/component"
import type { NotebookCell, SingleQueryResult } from "../../../store/notebook"
import type { NotebookResultSnapshot } from "../../../store/notebookResults"
import { useCellResultHydrationEngine } from "./resultHydration/CellResultHydrationContext"
import { useCellVirtualizationEngine } from "./cellVirtualization/CellVirtualizationContext"
import {
  NotebookProvider,
  useNotebookActions,
  useNotebookState,
  type NotebookActions,
} from "./NotebookProvider"
import { saveNotebookColumnLayout } from "./notebookColumnLayoutStore"
import {
  __resetNotebookUndoHistoryForTests,
  peekUndoEntry,
  recordUndoEntry,
} from "./undo/notebookUndoHistory"
import { useCellEditActions } from "./cellEditing/useCellEditActions"
import { dismissUndoToast } from "./cellEditing/undoToast"
import { dispatchTool } from "../../../utils/tools/dispatch"
import { appendCellToNotebook } from "../../../utils/notebooks/appendCellToNotebook"

const toast = vi.hoisted(() => ({
  success: vi.fn((_content: React.ReactNode) => "undo-toast"),
  warning: vi.fn(),
  dismiss: vi.fn(),
}))
vi.mock("../../../components/Toast", () => ({ toast }))

// The provider's own wiring of delete and undo, with storage replaced: the
// snapshot index, the document writes and the column layouts.
const storage = vi.hoisted(() => ({
  snapshotCellIds: [] as string[],
  snapshots: new Map<string, NotebookResultSnapshot>(),
  deleteCellSnapshot: vi.fn(() => Promise.resolve()),
  removeNotebookCellLayouts: vi.fn(),
  persisted: undefined as Promise<void> | undefined,
}))

vi.mock("../../../store/notebookResults", () => ({
  loadSnapshotCellIds: () => Promise.resolve(storage.snapshotCellIds),
  deleteCellSnapshot: storage.deleteCellSnapshot,
  loadCellSnapshot: (_bufferId: number, cellId: string) =>
    Promise.resolve(storage.snapshots.get(cellId)),
  copyNotebookSnapshots: () => Promise.resolve(0),
  pinNotebookSnapshots: vi.fn(),
  pruneToRecentNotebooks: () => Promise.resolve(),
}))
vi.mock("./useNotebookPersistence", () => ({
  useNotebookPersistence: () => ({
    persistCells: () => Promise.resolve(),
    persistImmediately: () =>
      storage.persisted === undefined ? Promise.resolve() : storage.persisted,
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

const probe: {
  actions?: NotebookActions
  cellIds?: string[]
  cells?: NotebookCell[]
  hydration?: ReturnType<typeof useCellResultHydrationEngine>
  virtualization?: ReturnType<typeof useCellVirtualizationEngine>
  edits?: ReturnType<typeof useCellEditActions>
} = {}

const Probe = () => {
  probe.actions = useNotebookActions()
  probe.edits = useCellEditActions()
  probe.cells = useNotebookState().cells
  probe.cellIds = probe.cells.map((c) => c.id)
  // Stand in for a cell entering the viewport, which loads its result.
  probe.hydration = useCellResultHydrationEngine()
  probe.virtualization = useCellVirtualizationEngine()
  return null
}

const storedRows = (query: string): SingleQueryResult => ({
  type: "dql",
  query,
  columns: [{ name: "x", type: "INT" }],
  dataset: [[42]],
  count: 1,
  fetchedAt: 500,
})

const mountNotebook = (cells: NotebookCell[], preview = false) =>
  renderComponent(
    <NotebookProvider
      bufferId={BUFFER_ID}
      initialState={{ cells }}
      preview={preview}
    >
      <Probe />
    </NotebookProvider>,
  )

beforeEach(() => {
  dismissUndoToast(BUFFER_ID)
  vi.clearAllMocks()
  storage.persisted = undefined
  __resetNotebookUndoHistoryForTests()
  localStorage.clear()
  storage.snapshotCellIds = []
  storage.snapshots.clear()
  storage.deleteCellSnapshot.mockClear()
  storage.removeNotebookCellLayouts.mockClear()
})

describe("NotebookProvider undo wiring", () => {
  it("keeps earlier user history when the Query Picker appends a cell", async () => {
    mountNotebook([cell("a"), cell("b"), cell("c")])
    act(() => probe.actions?.deleteCell("b"))
    const deletion = peekUndoEntry(BUFFER_ID)
    let added!: string
    await act(async () => {
      added = await appendCellToNotebook(BUFFER_ID, "SELECT 42")
    })
    act(() => {
      probe.actions?.undo()
    })
    expect(probe.cellIds).not.toContain(added)
    expect(peekUndoEntry(BUFFER_ID)).toBe(deletion)
    act(() => {
      probe.actions?.undo()
    })
    expect(probe.cellIds).toEqual(["a", "b", "c"])
  })

  it("lets the delete toast undo its change after keyboard undo and redo", () => {
    mountNotebook([cell("a"), cell("b"), cell("c")])
    act(() => probe.edits?.deleteCell("b", "shortcut"))
    const content = toast.success.mock.calls[0][0]
    act(() => probe.edits?.undo("shortcut"))
    act(() => probe.actions?.updateCell("b", { value: "SELECT 'edited'" }))
    act(() => probe.edits?.redo("shortcut"))
    const shown = renderComponent(<>{content}</>)
    fireEvent.click(shown.getByText("Undo"))
    expect(probe.cellIds).toEqual(["a", "b", "c"])
    expect(probe.cells?.find((cell) => cell.id === "b")?.value).toBe(
      "SELECT 'edited'",
    )
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it("refuses toast Undo when a different change is on top", () => {
    mountNotebook([cell("a"), cell("b"), cell("c")])
    act(() => probe.edits?.deleteCell("b", "shortcut"))
    const content = toast.success.mock.calls[0][0]
    act(() => {
      probe.actions?.addCell()
    })
    const shown = renderComponent(<>{content}</>)
    fireEvent.click(shown.getByText("Undo"))
    expect(probe.cellIds).not.toContain("b")
    expect(toast.warning).toHaveBeenCalledWith(
      "Cannot undo this change.",
      expect.anything(),
    )
  })

  it.each([
    ["move_cell_down", { buffer_id: BUFFER_ID, cell_id: "a" }],
    [
      "apply_notebook_state",
      {
        buffer_id: BUFFER_ID,
        cells: ["b", "a", "c"].map((id) => ({
          id,
          preserve_value: true,
        })),
      },
    ],
  ])(
    "preserves a user delete made while %s is still saving",
    async (tool, input) => {
      // Empty SQL keeps the full-state tool's post-apply auto-run out of
      // this persistence race, without requesting a result discard.
      mountNotebook(["a", "b", "c"].map((id) => ({ ...cell(id), value: "" })))
      act(() => {
        probe.actions?.addCell()
      })
      let finishSave!: () => void
      storage.persisted = new Promise<void>((resolve) => {
        finishSave = resolve
      })
      let pending!: ReturnType<typeof dispatchTool>
      await act(async () => {
        pending = dispatchTool(
          tool,
          input,
          {} as Parameters<typeof dispatchTool>[2],
          () => undefined,
          { grantSchemaAccess: true, read: true, write: true },
          () => Promise.resolve({ query: "", columns: [], timestamp: 0 }),
        )
        await Promise.resolve()
      })
      expect(probe.cellIds?.slice(0, 3)).toEqual(["b", "a", "c"])
      expect(peekUndoEntry(BUFFER_ID)).toBeUndefined()
      act(() => probe.edits?.deleteCell("b", "shortcut"))
      const userEntry = peekUndoEntry(BUFFER_ID)
      const dismissed = toast.dismiss.mock.calls.length
      storage.persisted = undefined
      await act(async () => {
        finishSave()
        expect((await pending).is_error).toBeFalsy()
      })
      expect(peekUndoEntry(BUFFER_ID)).toBe(userEntry)
      expect(toast.dismiss).toHaveBeenCalledTimes(dismissed)
      expect(storage.deleteCellSnapshot).not.toHaveBeenCalledWith(
        BUFFER_ID,
        "b",
      )
      expect(storage.removeNotebookCellLayouts).not.toHaveBeenCalledWith(
        BUFFER_ID,
        "b",
      )
      act(() => probe.edits?.undo("shortcut"))
      expect(probe.cellIds).toContain("b")
    },
  )

  it("brings a deleted cell back with the same id and its stored result", async () => {
    // Given a notebook whose middle cell has run and has stored rows
    const ran: NotebookCell = { ...cell("b"), lastRunStatus: "success" }
    storage.snapshots.set("b", {
      bufferId: BUFFER_ID,
      cellId: "b",
      results: [storedRows(ran.value)],
      savedAt: 1000,
    })
    storage.snapshotCellIds = ["b"]
    mountNotebook([cell("a"), ran, cell("c")])

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

    // Then the same cell is back in its place
    expect(step).toEqual({ kind: "inserted", cellIds: ["b"] })
    expect(probe.cellIds).toEqual(["a", "b", "c"])

    // And once it is on screen, its stored rows load again
    act(() => {
      probe.virtualization?.reportMountBand("b", true, 0)
      probe.virtualization?.reportRetainBand("b", true)
      probe.hydration?.request("b")
    })
    await waitFor(() =>
      expect(probe.cells?.find((c) => c.id === "b")?.result?.results).toEqual([
        expect.objectContaining({ dataset: [[42]] }),
      ]),
    )
  })

  it("keeps the stored results of a cell the undo history holds on mount", async () => {
    // Given a deleted cell "held" that undo can still bring back, and a cell
    // "gone" that nothing refers to, both with stored results
    recordUndoEntry(BUFFER_ID, {
      change: "remove",
      placements: [{ cell: cell("held"), index: 1, afterCellId: "a" }],
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

  it("records nothing in the preview of an archived notebook", () => {
    // Given an archived notebook shown as a preview, which is never saved
    mountNotebook([cell("a"), cell("b"), cell("c")], true)

    // When a cell is deleted and moved there
    act(() => probe.actions?.deleteCell("b"))
    act(() => probe.actions?.moveCellDown("a"))

    // Then the undo history stays empty, so nothing carries over to the
    // notebook once it is restored, and undo has nothing to step
    expect(peekUndoEntry(BUFFER_ID)).toBeUndefined()
    let step: ReturnType<NotebookActions["undo"]> | undefined
    act(() => {
      step = probe.actions?.undo()
    })
    expect(step).toEqual({ kind: "empty" })
    expect(probe.cellIds).toEqual(["c", "a"])
  })

  it("keeps the stored results of a cell an outdated undo expects gone", () => {
    // Given an undo entry for the removal of "b", while "b" is in the
    // notebook, e.g. the document changed without the history knowing
    mountNotebook([cell("a"), cell("b")])
    recordUndoEntry(BUFFER_ID, {
      change: "remove",
      placements: [{ cell: cell("b"), index: 1, afterCellId: "a" }],
    })

    // When the user undoes it
    let step: ReturnType<NotebookActions["undo"]> | undefined
    act(() => {
      step = probe.actions?.undo()
    })

    // Then the undo reports it cannot apply, and the live cell keeps its
    // stored result and column layout
    expect(step).toEqual({ kind: "stale" })
    expect(peekUndoEntry(BUFFER_ID)).toBeUndefined()
    expect(probe.cellIds).toEqual(["a", "b"])
    expect(storage.deleteCellSnapshot).not.toHaveBeenCalledWith(BUFFER_ID, "b")
    expect(storage.removeNotebookCellLayouts).not.toHaveBeenCalledWith(
      BUFFER_ID,
      "b",
    )
  })

  it("drops on mount the column layout of a deleted cell without stored results", () => {
    // Given column layouts for a live cell "a", a cell "held" that undo can
    // still bring back, and a cell "gone" deleted before a reload whose
    // results were closed, so it has no stored results
    recordUndoEntry(BUFFER_ID, {
      change: "remove",
      placements: [{ cell: cell("held"), index: 1, afterCellId: "a" }],
    })
    for (const cellId of ["a", "held", "gone"]) {
      saveNotebookColumnLayout(BUFFER_ID, cellId, "q:select", {
        columnSizing: { col_0: 100 },
      })
    }

    // When the notebook mounts
    mountNotebook([cell("a")])

    // Then only the layout nothing refers to is removed
    expect(storage.removeNotebookCellLayouts).toHaveBeenCalledWith(
      BUFFER_ID,
      "gone",
    )
    expect(storage.removeNotebookCellLayouts).toHaveBeenCalledTimes(1)
  })
})
