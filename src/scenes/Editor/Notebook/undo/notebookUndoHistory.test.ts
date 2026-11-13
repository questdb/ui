import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { deleteCellSnapshot } from "../../../../store/notebookResults"
import { removeNotebookCellLayouts } from "../notebookColumnLayoutStore"
import {
  MAX_RETAINED_CELLS,
  MERGE_WINDOW_MS,
  __resetNotebookUndoHistoryForTests,
  clearNotebookUndoHistory,
  isCellHeldByUndo,
  peekUndoEntry,
  recordUndoEntry,
  settleUndo,
  type ArrangementEntry,
  type CellListEntry,
  type UndoEntry,
} from "./notebookUndoHistory"

vi.mock("../../../../store/notebookResults", () => ({
  deleteCellSnapshot: vi.fn(() => Promise.resolve()),
}))
vi.mock("../notebookColumnLayoutStore", () => ({
  removeNotebookCellLayouts: vi.fn(),
}))

const BUFFER_ID = 3

const entry = (change: CellListEntry["change"], cellId: string): UndoEntry => ({
  change,
  placements: [
    {
      cell: { id: cellId, position: 0, value: "SELECT 1" },
      index: 0,
      afterCellId: null,
    },
  ],
})

const move = (from: string[], to: string[]): ArrangementEntry => ({
  change: "arrange",
  cellIds: ["a"],
  before: { order: from },
  after: { order: to },
})

const releasedCellIds = () =>
  vi.mocked(deleteCellSnapshot).mock.calls.map(([, cellId]) => cellId)

beforeEach(() => {
  __resetNotebookUndoHistoryForTests()
  vi.mocked(deleteCellSnapshot).mockClear()
  vi.mocked(removeNotebookCellLayouts).mockClear()
})

describe("notebookUndoHistory", () => {
  it("lets the oldest removed cells give up their results past the cap", () => {
    // Given one more removed cell than the history keeps results for
    const cellIds = Array.from(
      { length: MAX_RETAINED_CELLS + 1 },
      (_, index) => `c${index}`,
    )

    // When each removal is recorded
    cellIds.forEach((cellId) =>
      recordUndoEntry(BUFFER_ID, entry("remove", cellId)),
    )

    // Then only the oldest cell's results and column layout go, and its
    // entry stays undoable
    expect(releasedCellIds()).toEqual(["c0"])
    expect(removeNotebookCellLayouts).toHaveBeenCalledWith(BUFFER_ID, "c0")
    expect(isCellHeldByUndo(BUFFER_ID, "c0")).toBe(false)
    expect(isCellHeldByUndo(BUFFER_ID, "c1")).toBe(true)
  })

  it("lets an undone insert's results go when a new change drops the redo", () => {
    // Given a paste that was undone, so its cell waits in the redo stack
    const paste = entry("insert", "pasted")
    recordUndoEntry(BUFFER_ID, paste)
    settleUndo(BUFFER_ID, paste, new Set())
    expect(isCellHeldByUndo(BUFFER_ID, "pasted")).toBe(true)

    // When the user makes another change
    recordUndoEntry(BUFFER_ID, entry("insert", "added"))

    // Then the redo is gone, and with it the pasted cell's results
    expect(releasedCellIds()).toEqual(["pasted"])
  })

  it("does not hold a cell that an undo put back", () => {
    // Given a delete that was undone
    const removal = entry("remove", "restored")
    recordUndoEntry(BUFFER_ID, removal)
    settleUndo(BUFFER_ID, removal, new Set())

    // When the history is cleared, e.g. after an agent edit
    clearNotebookUndoHistory(BUFFER_ID)

    // Then the restored cell keeps its results
    expect(isCellHeldByUndo(BUFFER_ID, "restored")).toBe(false)
    expect(releasedCellIds()).toEqual([])
    expect(removeNotebookCellLayouts).not.toHaveBeenCalled()
    expect(peekUndoEntry(BUFFER_ID)).toBeUndefined()
  })

  it("releases held rows and layouts from both stacks when cleared", () => {
    recordUndoEntry(BUFFER_ID, entry("remove", "deleted"))
    const paste = entry("insert", "undone-paste")
    recordUndoEntry(BUFFER_ID, paste)
    settleUndo(BUFFER_ID, paste, new Set())
    recordUndoEntry(BUFFER_ID + 1, entry("remove", "other-notebook"))

    clearNotebookUndoHistory(BUFFER_ID)
    clearNotebookUndoHistory(BUFFER_ID)

    expect(releasedCellIds()).toEqual(["deleted", "undone-paste"])
    expect(removeNotebookCellLayouts).toHaveBeenCalledTimes(2)
    expect(removeNotebookCellLayouts).toHaveBeenCalledWith(BUFFER_ID, "deleted")
    expect(removeNotebookCellLayouts).toHaveBeenCalledWith(
      BUFFER_ID,
      "undone-paste",
    )
    expect(peekUndoEntry(BUFFER_ID)).toBeUndefined()
    expect(isCellHeldByUndo(BUFFER_ID, "deleted")).toBe(false)
    expect(isCellHeldByUndo(BUFFER_ID, "undone-paste")).toBe(false)
    expect(isCellHeldByUndo(BUFFER_ID + 1, "other-notebook")).toBe(true)
  })

  describe("joining repeated moves", () => {
    const firstMove = move(["a", "b", "c"], ["b", "a", "c"])
    const secondMove = move(["b", "a", "c"], ["b", "c", "a"])

    const undoAll = (): UndoEntry[] => {
      const undone: UndoEntry[] = []
      for (
        let top = peekUndoEntry(BUFFER_ID);
        top;
        top = peekUndoEntry(BUFFER_ID)
      ) {
        undone.push(top)
        settleUndo(BUFFER_ID, undefined, new Set())
      }
      return undone
    }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it("joins a quick repeat of the same move into one change", () => {
      // Given a move of cell "a"
      const now = vi.spyOn(Date, "now").mockReturnValue(0)
      recordUndoEntry(BUFFER_ID, firstMove, "move:a")

      // When it repeats within the merge window
      now.mockReturnValue(MERGE_WINDOW_MS - 1)
      recordUndoEntry(BUFFER_ID, secondMove, "move:a")

      // Then one change goes from the first start to the last end
      expect(undoAll()).toEqual([
        {
          ...secondMove,
          before: { order: ["a", "b", "c"] },
          after: { order: ["b", "c", "a"] },
        },
      ])
    })

    it("keeps a slow repeat apart", () => {
      // Given a move of cell "a"
      const now = vi.spyOn(Date, "now").mockReturnValue(0)
      recordUndoEntry(BUFFER_ID, firstMove, "move:a")

      // When it repeats after the merge window
      now.mockReturnValue(MERGE_WINDOW_MS)
      recordUndoEntry(BUFFER_ID, secondMove, "move:a")

      // Then each move is its own change
      expect(undoAll()).toEqual([secondMove, firstMove])
    })

    it("drops a quick move that ends where it started", () => {
      // Given a move of cell "a" down
      vi.spyOn(Date, "now").mockReturnValue(0)
      recordUndoEntry(BUFFER_ID, firstMove, "move:a")

      // When the cell is moved back up at once
      recordUndoEntry(
        BUFFER_ID,
        move(["b", "a", "c"], ["a", "b", "c"]),
        "move:a",
      )

      // Then nothing is left to undo
      expect(peekUndoEntry(BUFFER_ID)).toBeUndefined()
    })

    it("does not join a repeat to a move that was undone", () => {
      // Given a move of cell "a" that was undone
      vi.spyOn(Date, "now").mockReturnValue(0)
      recordUndoEntry(BUFFER_ID, firstMove, "move:a")
      settleUndo(BUFFER_ID, firstMove, new Set())

      // When the user moves the cell again at once
      recordUndoEntry(BUFFER_ID, secondMove, "move:a")

      // Then only the new move is on the history
      expect(undoAll()).toEqual([secondMove])
    })
  })
})
