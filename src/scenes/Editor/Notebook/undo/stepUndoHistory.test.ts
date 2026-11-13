import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NotebookCell, NotebookSettings } from "../../../../store/notebook"
import {
  arrangeCellsTransition,
  attachCellsTransition,
  detachCellsTransition,
  moveCellDownTransition,
  type ViewParts,
} from "../../../../utils/notebooks/notebookController"
import { silently } from "../../../../utils/notebooks/notebookToolError"
import { cellPlacementsOf } from "../notebookUtils"
import {
  __resetNotebookUndoHistoryForTests,
  peekUndoEntry,
  recordUndoEntry,
} from "./notebookUndoHistory"
import { stepUndoHistory } from "./stepUndoHistory"
import type { Arrangement } from "./cellArrangement"
import { recordArrangement, type ArrangeOptions } from "./recordArrangement"

vi.mock("../../../../store/notebookResults", () => ({
  deleteCellSnapshot: vi.fn(() => Promise.resolve()),
}))

const BUFFER_ID = 5

const cell = (
  id: string,
  value: string,
  overrides: Partial<NotebookCell> = {},
): NotebookCell => ({ id, position: 0, value, ...overrides })

// A document the steps act on through the real transitions.
const createNotebook = (cells: NotebookCell[], settings: NotebookSettings) => {
  let parts: ViewParts = {
    cells,
    settings,
    maximizedCellId: null,
    focusedCellId: null,
  }
  const deps = () => ({
    cells: parts.cells,
    detach: (cellIds: string[]) =>
      silently(() => {
        const out = detachCellsTransition(parts, BUFFER_ID, {
          cellIds,
        })
        parts = out.parts
        return out.result
      }),
    attach: (
      placements: Parameters<typeof attachCellsTransition>[2]["placements"],
    ) =>
      silently(() => {
        const out = attachCellsTransition(parts, BUFFER_ID, {
          placements,
        })
        parts = out.parts
        return out.result
      }),
    arrange: (arrangement: Arrangement) =>
      silently(() => {
        const out = arrangeCellsTransition(parts, BUFFER_ID, arrangement)
        parts = out.parts
        return out.result
      }) ?? false,
  })
  // Records a move or resize through the provider's recorder.
  const arrangeCells = (
    cellIds: string[],
    apply: (current: ViewParts) => ViewParts,
    options?: ArrangeOptions,
  ) =>
    recordArrangement(
      BUFFER_ID,
      () => ({ cells: parts.cells, layout: parts.settings.layout }),
      cellIds,
      () => {
        parts = apply(parts)
      },
      options,
    )
  return {
    arrangeCells,
    editWithoutHistory: (apply: (current: ViewParts) => ViewParts) => {
      parts = apply(parts)
    },
    parts: () => parts,
    undo: () => stepUndoHistory(BUFFER_ID, "undo", deps()),
    redo: () => stepUndoHistory(BUFFER_ID, "redo", deps()),
    removeWithoutHistory: (cellId: string) => deps().detach([cellId]),
    deleteCell: (cellId: string) => {
      const placements = deps().detach([cellId])
      if (placements) {
        recordUndoEntry(BUFFER_ID, {
          change: "remove",
          placements,
        })
      }
    },
  }
}

const idsOf = (parts: ViewParts) => parts.cells.map((c) => c.id)

beforeEach(() => {
  __resetNotebookUndoHistoryForTests()
})

describe("stepUndoHistory", () => {
  it("brings a deleted cell back, and redo deletes it again", () => {
    // Given a ran cell deleted from the middle of a notebook
    const notebook = createNotebook(
      [
        cell("a", "SELECT 1"),
        cell("b", "SELECT 2", { lastRunStatus: "success" }),
        cell("c", "SELECT 3"),
      ],
      {},
    )
    notebook.deleteCell("b")

    // When the delete is undone
    const undone = notebook.undo()

    // Then the cell is back in place with its run history
    expect(undone).toEqual({ kind: "inserted", cellIds: ["b"] })
    expect(idsOf(notebook.parts())).toEqual(["a", "b", "c"])
    expect(notebook.parts().cells[1].lastRunStatus).toBe("success")

    // When it is redone
    const redone = notebook.redo()

    // Then it is gone again, and the next cell takes its place
    expect(redone).toEqual({
      kind: "removed",
      cellIds: ["b"],
      neighbourId: "c",
    })
    expect(idsOf(notebook.parts())).toEqual(["a", "c"])
  })

  it("leaves variables unchanged when undoing and redoing a paste", () => {
    // Given destination variables used by existing and pasted cells
    const variables = [
      { name: "days", value: "7" },
      { name: "start", value: "dateadd('d', -@days, now())" },
      { name: "from", value: "now()" },
    ]
    const notebook = createNotebook(
      [cell("a", "SELECT @start"), cell("pasted", "SELECT @from, @start")],
      { variables },
    )
    recordUndoEntry(BUFFER_ID, {
      change: "insert",
      placements: cellPlacementsOf(notebook.parts().cells, undefined, [
        "pasted",
      ]),
    })

    // When the paste is undone
    notebook.undo()

    // Then only the pasted cell leaves; the settings keep their identity
    expect(idsOf(notebook.parts())).toEqual(["a"])
    expect(notebook.parts().settings.variables).toBe(variables)

    // When it is redone
    notebook.redo()

    // Then the cell returns without changing the variables
    expect(notebook.parts().settings.variables).toBe(variables)
  })

  it("drops a change that no longer fits the notebook", () => {
    // Given an add whose cell was later removed outside the history
    const notebook = createNotebook(
      [cell("a", "SELECT 1"), cell("added", "")],
      {},
    )
    recordUndoEntry(BUFFER_ID, {
      change: "insert",
      placements: cellPlacementsOf(notebook.parts().cells, undefined, [
        "added",
      ]),
    })
    notebook.removeWithoutHistory("added")

    // When the add is undone
    const step = notebook.undo()

    // Then nothing changes and the entry is gone
    expect(step).toEqual({ kind: "stale" })
    expect(idsOf(notebook.parts())).toEqual(["a"])
    expect(peekUndoEntry(BUFFER_ID)).toBeUndefined()
  })

  it("undoes arrow-key moves of one cell as one step", () => {
    // Given cell "a" moved down twice in quick succession
    const notebook = createNotebook(
      [cell("a", "SELECT 1"), cell("b", "SELECT 2"), cell("c", "SELECT 3")],
      {},
    )
    const moveDown = (current: ViewParts) =>
      moveCellDownTransition(current, BUFFER_ID, "a").parts
    notebook.arrangeCells(["a"], moveDown, { mergeKey: "move:a" })
    notebook.arrangeCells(["a"], moveDown, { mergeKey: "move:a" })
    expect(idsOf(notebook.parts())).toEqual(["b", "c", "a"])

    // When the moves are undone
    const step = notebook.undo()

    // Then one step puts "a" back on top, and redo moves it down again
    expect(step).toMatchObject({ kind: "arranged", cellIds: ["a"] })
    expect(idsOf(notebook.parts())).toEqual(["a", "b", "c"])
    notebook.redo()
    expect(idsOf(notebook.parts())).toEqual(["b", "c", "a"])
  })

  it("undoes a resize without touching sizes it did not change", () => {
    // Given a result pane resized, then the editor grown by typing
    const notebook = createNotebook(
      [cell("a", "SELECT 1", { topHeight: 72, bottomHeight: 200 })],
      {},
    )
    const withSizes =
      (sizes: Partial<NotebookCell>) => (current: ViewParts) => ({
        ...current,
        cells: [{ ...current.cells[0], ...sizes }],
      })
    notebook.arrangeCells(
      ["a"],
      withSizes({ bottomHeight: 400, bottomResized: true }),
    )
    notebook.editWithoutHistory(withSizes({ topHeight: 120 }))

    // When the resize is undone
    notebook.undo()

    // Then the result pane is back, and the editor keeps its new height
    expect(notebook.parts().cells[0]).toMatchObject({
      topHeight: 120,
      bottomHeight: 200,
      bottomResized: undefined,
    })
  })

  it("undoes a drag that wrote the store before it ended to its start", () => {
    // Given an editor drag that wrote a height mid-drag, then ended
    const original = cell("a", "SELECT 1", { topHeight: 72 })
    const notebook = createNotebook([original], {})
    const withSizes =
      (sizes: Partial<NotebookCell>) => (current: ViewParts) => ({
        ...current,
        cells: [{ ...current.cells[0], ...sizes }],
      })
    notebook.editWithoutHistory(withSizes({ topHeight: 300, topResized: true }))
    notebook.arrangeCells(["a"], withSizes({ topHeight: 320 }), {
      startCells: [original],
    })

    // When the drag is undone
    notebook.undo()

    // Then the editor is back to its height from before the drag
    expect(notebook.parts().cells[0]).toMatchObject({
      topHeight: 72,
      topResized: undefined,
    })
  })

  it("drops a move when the cells changed outside the history", () => {
    // Given a move, then a cell removed outside the history
    const notebook = createNotebook(
      [cell("a", "SELECT 1"), cell("b", "SELECT 2"), cell("c", "SELECT 3")],
      {},
    )
    notebook.arrangeCells(
      ["a"],
      (current) => moveCellDownTransition(current, BUFFER_ID, "a").parts,
    )
    notebook.removeWithoutHistory("c")

    // When the move is undone
    const step = notebook.undo()

    // Then the order is left alone and the entry is gone
    expect(step).toEqual({ kind: "stale" })
    expect(idsOf(notebook.parts())).toEqual(["b", "a"])
    expect(peekUndoEntry(BUFFER_ID)).toBeUndefined()
  })
})
