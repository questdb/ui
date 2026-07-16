import "../../../test/stubBrowserGlobals"
import { describe, expect, it } from "vitest"

import {
  addCellTransition,
  applyNotebookStateTransition,
  deleteCellTransition,
  duplicateCellTransition,
  updateCellTransition,
} from "./notebookTransitions"
import type { ViewParts } from "../notebookDexieView"
import { NotebookToolError } from "../notebookToolError"
import {
  MAX_CELL_LINES,
  MAX_NOTEBOOK_CELLS,
  type NotebookCell,
} from "../../../store/notebook"

const BUFFER_ID = 7

const cell = (
  id: string,
  value = "",
  overrides: Partial<NotebookCell> = {},
): NotebookCell => ({ id, position: 0, value, ...overrides })

const partsOf = (
  cells: NotebookCell[],
  overrides: Partial<ViewParts> = {},
): ViewParts => ({
  cells,
  settings: {},
  maximizedCellId: null,
  focusedCellId: null,
  ...overrides,
})

describe("applyNotebookStateTransition", () => {
  it("carries every dropped cell in cleanup.cellIds for post-commit removal", () => {
    // Given a three-cell notebook
    const parts = partsOf([cell("a"), cell("b"), cell("c")])
    // When a full-state apply keeps only "a"
    const out = applyNotebookStateTransition(parts, {
      cells: [{ id: "a", preserveValue: true }],
    })
    // Then the two dropped cells travel in cleanup so the shell can drop their
    // snapshots/layouts after it commits, and the diff names them deleted
    expect(out.cleanup?.cellIds).toEqual(["b", "c"])
    expect(out.result.applied.deleted).toEqual(["b", "c"])
  })

  it("returns the applied diff nested under { applied: { added, updated, deleted } }", () => {
    // Given a one-cell notebook
    const parts = partsOf([cell("a", "SELECT 1")])
    // When an apply updates "a" and adds a brand-new cell
    const out = applyNotebookStateTransition(parts, {
      cells: [{ id: "a", value: "SELECT 2" }, { value: "SELECT 3" }],
    })
    // Then the result shape the dispatch layer relays back is preserved: a
    // single `applied` key holding the three diff arrays
    expect(Object.keys(out.result)).toEqual(["applied"])
    expect(Array.isArray(out.result.applied.added)).toBe(true)
    expect(Array.isArray(out.result.applied.updated)).toBe(true)
    expect(Array.isArray(out.result.applied.deleted)).toBe(true)
    expect(out.result.applied.added).toHaveLength(1)
    expect(out.result.applied.deleted).toHaveLength(0)
  })

  it("revalidates focusedCellId: drops a focus whose cell the apply removed", () => {
    // Given the focused cell is about to be replaced wholesale
    const parts = partsOf([cell("a")], { focusedCellId: "a" })
    // When a full-state apply drops it
    const out = applyNotebookStateTransition(parts, {
      cells: [{ value: "SELECT 2" }],
    })
    // Then no ghost focus target survives for the next mount's scroll
    expect(out.parts.focusedCellId).toBeNull()
  })

  it("revalidates focusedCellId: keeps a focus whose cell survives the apply", () => {
    // Given a focused cell that the apply preserves
    const parts = partsOf([cell("a"), cell("b")], { focusedCellId: "a" })
    // When the apply keeps "a"
    const out = applyNotebookStateTransition(parts, {
      cells: [
        { id: "a", preserveValue: true },
        { id: "b", preserveValue: true },
      ],
    })
    // Then the focus is left untouched
    expect(out.parts.focusedCellId).toBe("a")
  })

  it("does no freshness checking: it takes only (parts, request), no read-seq", () => {
    // Freshness is gated once at the dispatch layer, never inside a transition;
    // a seq parameter here would let staleness leak into the pure layer.
    expect(applyNotebookStateTransition).toHaveLength(2)
  })

  it("does no freshness checking: re-applying its own output never staleness-throws", () => {
    // Given an apply has already run
    const parts = partsOf([cell("a", "SELECT 1")])
    const request = { cells: [{ id: "a", value: "SELECT 2" }] }
    const once = applyNotebookStateTransition(parts, request)
    // When the same request runs again against the already-applied parts
    // Then the transition applies unconditionally rather than rejecting as stale
    expect(() =>
      applyNotebookStateTransition(once.parts, request),
    ).not.toThrow()
  })
})

describe("deleteCellTransition", () => {
  it("carries the deleted cell in cleanup and clears it from focus and maximize", () => {
    // Given a two-cell notebook with the doomed cell focused and maximized
    const parts = partsOf([cell("a"), cell("b")], {
      focusedCellId: "b",
      maximizedCellId: "b",
    })
    // When "b" is deleted
    const out = deleteCellTransition(parts, BUFFER_ID, "b")
    // Then its snapshot/layout is queued for cleanup and no dangling id remains,
    // and no notification aims at the now-gone cell
    expect(out.cleanup?.cellIds).toEqual(["b"])
    expect(out.parts.focusedCellId).toBeNull()
    expect(out.parts.maximizedCellId).toBeNull()
    expect(out.touchedCellId).toBeUndefined()
  })

  it("throws last_cell rather than emptying the notebook", () => {
    // Given a single-cell notebook
    const parts = partsOf([cell("a")])
    // When a delete of the only cell is attempted
    // Then it throws the typed error the agent needs to re-sync
    expect(() => deleteCellTransition(parts, BUFFER_ID, "a")).toThrow(
      NotebookToolError,
    )
  })
})

describe("transition validation guards", () => {
  const overLineLimit = Array(MAX_CELL_LINES + 1)
    .fill("x")
    .join("\n")
  const fullNotebook = (): NotebookCell[] =>
    Array.from({ length: MAX_NOTEBOOK_CELLS }, (_, i) => cell(`c${i}`))

  const codeOf = (fn: () => unknown): string | undefined => {
    try {
      fn()
    } catch (e) {
      return e instanceof NotebookToolError ? e.code : "not-a-tool-error"
    }
    return undefined
  }

  it("addCell throws cell_limit at the cap", () => {
    expect(
      codeOf(() =>
        addCellTransition(partsOf(fullNotebook()), BUFFER_ID, {
          id: "x",
          value: "SELECT 1",
        }),
      ),
    ).toBe("cell_limit")
  })

  it("addCell throws cell_too_large for an oversized SQL value", () => {
    expect(
      codeOf(() =>
        addCellTransition(partsOf([]), BUFFER_ID, {
          id: "x",
          value: overLineLimit,
        }),
      ),
    ).toBe("cell_too_large")
  })

  it("addCell exempts markdown from the line limit", () => {
    expect(
      codeOf(() =>
        addCellTransition(partsOf([]), BUFFER_ID, {
          id: "x",
          value: overLineLimit,
          type: "markdown",
        }),
      ),
    ).toBeUndefined()
  })

  it("updateCell throws cell_too_large for an oversized SQL cell", () => {
    expect(
      codeOf(() =>
        updateCellTransition(partsOf([cell("a", "SELECT 1")]), BUFFER_ID, "a", {
          value: overLineLimit,
        }),
      ),
    ).toBe("cell_too_large")
  })

  it("updateCell exempts a markdown cell from the line limit", () => {
    expect(
      codeOf(() =>
        updateCellTransition(
          partsOf([cell("a", "# md", { type: "markdown" })]),
          BUFFER_ID,
          "a",
          { value: overLineLimit },
        ),
      ),
    ).toBeUndefined()
  })

  it("updateCell throws unknown_cell for a missing id", () => {
    expect(
      codeOf(() =>
        updateCellTransition(partsOf([cell("a")]), BUFFER_ID, "nope", {
          value: "SELECT 1",
        }),
      ),
    ).toBe("unknown_cell")
  })

  it("deleteCell throws unknown_cell for a missing id", () => {
    expect(
      codeOf(() =>
        deleteCellTransition(
          partsOf([cell("a"), cell("b")]),
          BUFFER_ID,
          "nope",
        ),
      ),
    ).toBe("unknown_cell")
  })

  it("duplicateCell throws cell_limit at the cap", () => {
    expect(
      codeOf(() =>
        duplicateCellTransition(
          partsOf(fullNotebook()),
          BUFFER_ID,
          "c0",
          "new",
        ),
      ),
    ).toBe("cell_limit")
  })

  it("duplicateCell throws unknown_cell before the limit check", () => {
    expect(
      codeOf(() =>
        duplicateCellTransition(
          partsOf(fullNotebook()),
          BUFFER_ID,
          "nope",
          "new",
        ),
      ),
    ).toBe("unknown_cell")
  })
})
