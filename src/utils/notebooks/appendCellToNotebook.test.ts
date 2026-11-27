import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NotebookCell } from "../../store/notebook"
import {
  __resetNotebookUndoHistoryForTests,
  peekUndoEntry,
  recordUndoEntry,
} from "../../scenes/Editor/Notebook/undo/notebookUndoHistory"
import type {
  NotebookController,
  NotebookControllerActions,
  ViewParts,
} from "./notebookController"
import { appendCellToNotebook } from "./appendCellToNotebook"

const notebook = vi.hoisted(() => ({ parts: null as ViewParts | null }))

// Use the live controller for undo registration. Only the mounted notebook's
// state and persistence are simulated.
vi.mock("./notebookController", async (importActual) => {
  const actual = await importActual<typeof import("./notebookController")>()
  const applyTransition: NotebookControllerActions["applyTransition"] = async (
    transition,
  ) => {
    const applied = transition(notebook.parts as ViewParts)
    notebook.parts = applied.parts
    return applied.result
  }
  return {
    ...actual,
    withBoundNotebook: <T>(
      bufferId: number,
      fn: (controller: NotebookController) => Promise<T>,
    ) =>
      fn(
        actual.createNotebookController(bufferId, {
          current: {
            applyTransition,
            readRefreshState: () => new Map(),
            readResultStatus: () => "unrequested",
            noteResultMissing: () => undefined,
            runCell: vi.fn(),
            getCellsSnapshot: () => notebook.parts?.cells ?? [],
            getSettings: () => notebook.parts?.settings ?? {},
            getMaximizedCellId: () => null,
            flushChartSnapshots: async () => undefined,
          },
        }),
      ),
  }
})

const BUFFER_ID = 7

const cell = (id: string): NotebookCell => ({
  id,
  position: 0,
  value: `SELECT '${id}'`,
})

const partsWith = (
  cells: NotebookCell[],
  settings: ViewParts["settings"] = {},
): ViewParts => ({
  cells,
  settings,
  maximizedCellId: null,
  focusedCellId: null,
})

beforeEach(() => {
  __resetNotebookUndoHistoryForTests()
})

describe("appendCellToNotebook", () => {
  it("puts the appended cell on top of the undo history", async () => {
    // Given a notebook whose last user change was a move
    notebook.parts = partsWith([cell("a"), cell("b")])
    recordUndoEntry(BUFFER_ID, {
      change: "arrange",
      cellIds: ["a"],
      before: { order: ["a", "b"] },
      after: { order: ["b", "a"] },
    })

    // When a query is added from the Query Picker or the Schema panel
    const cellId = await appendCellToNotebook(BUFFER_ID, "SELECT 42")

    // Then the cell lands at the end, and undo takes it away before the move
    expect(notebook.parts.cells.map((c) => c.id)).toEqual(["a", "b", cellId])
    const entry = peekUndoEntry(BUFFER_ID)
    expect(entry?.change).toBe("insert")
    const placements = entry?.change === "insert" ? entry.placements : []
    expect(placements).toHaveLength(1)
    expect(placements[0]).toMatchObject({ index: 2, afterCellId: "b" })
    expect(placements[0].cell).toMatchObject({ id: cellId, value: "SELECT 42" })
  })

  it("records the grid position, so redo puts the cell back in place", async () => {
    // Given a grid notebook
    notebook.parts = partsWith([cell("a")], {
      layoutMode: "grid",
      layout: [{ i: "a", x: 0, y: 0, w: 12, h: 10 }],
    })

    // When a query is appended
    const cellId = await appendCellToNotebook(BUFFER_ID, "SELECT 1")

    // Then the undo entry carries the new cell's grid item
    const entry = peekUndoEntry(BUFFER_ID)
    expect(entry?.change).toBe("insert")
    expect(
      entry?.change === "insert" ? entry.placements[0].layoutItem?.i : null,
    ).toBe(cellId)
  })
})
