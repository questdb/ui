import "../../../test/stubBrowserGlobals"
import { describe, expect, it } from "vitest"

import {
  addCellTransition,
  applyNotebookStateTransition,
  deleteCellTransition,
  duplicateCellTransition,
  setCellDimensionsTransition,
  setCellLayoutTransition,
  setCellModeTransition,
  updateCellTransition,
} from "./notebookTransitions"
import type { ViewParts } from "../notebookDexieView"
import { NotebookToolError } from "../notebookToolError"
import { topHeightForSql } from "../../../scenes/Editor/Notebook/notebookUtils"
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

describe("setCellDimensionsTransition", () => {
  it("shows the editor by expanding the derived footprint and preserving both panes", () => {
    const chart = cell("a", "SELECT 1", {
      mode: "draw",
      topHeight: 72,
      bottomHeight: 350,
      preferredView: "result",
    })
    const parts = partsOf([chart], {
      settings: {
        layoutMode: "grid",
        layout: [{ i: "a", x: 0, y: 0, w: 12, h: 14 }],
      },
    })

    const out = setCellDimensionsTransition(parts, BUFFER_ID, "a", {
      view: "editor_result",
      compact: false,
    })

    expect(out.parts.cells[0]).toMatchObject({
      topHeight: 72,
      bottomHeight: 350,
      preferredView: "editor_result",
    })
    expect(out.parts.settings.layout?.[0].h).toBe(17)
    expect(out.result).toEqual({
      preferred_view: "editor_result",
      view: "editor_result",
      tier: "wide",
    })
  })

  it("supports null preserve, auto reset, and a fixed result height", () => {
    const chart = cell("a", "SELECT 1", {
      mode: "draw",
      topHeight: 200,
      topResized: true,
      bottomHeight: 350,
      bottomResized: false,
      preferredView: "result",
    })

    const out = setCellDimensionsTransition(partsOf([chart]), BUFFER_ID, "a", {
      editorHeight: "auto",
      resultHeight: 280,
      view: null,
    })

    expect(out.parts.cells[0]).toMatchObject({
      topHeight: 72,
      topResized: false,
      bottomHeight: 280,
      bottomResized: true,
      preferredView: "result",
    })
    expect(out.result).toEqual({ preferred_view: "result" })
  })

  it("stores one editor preference and reports its compact projection", () => {
    const chart = cell("a", "SELECT 1", {
      mode: "draw",
      preferredView: "result",
    })

    const out = setCellDimensionsTransition(partsOf([chart]), BUFFER_ID, "a", {
      view: "editor",
      compact: true,
    })

    expect(out.parts.cells[0]).toMatchObject({
      preferredView: "editor",
    })
    expect(out.result).toEqual({
      preferred_view: "editor",
      view: "editor",
      tier: "compact",
    })
  })

  it("reports the deterministic compact fallback without losing the wide preference", () => {
    const chart = cell("a", "SELECT 1", { mode: "draw" })
    const out = setCellDimensionsTransition(partsOf([chart]), BUFFER_ID, "a", {
      view: "editor_result",
      compact: true,
    })

    expect(out.parts.cells[0]).toMatchObject({
      preferredView: "editor_result",
    })
    expect(out.result).toEqual({
      preferred_view: "editor_result",
      view: "result",
      tier: "compact",
      fallback: "editor_result_unavailable_in_compact",
    })
  })

  it("ignores view and result_height on a markdown cell and reports null views", () => {
    // Given a markdown cell
    const markdown = cell("a", "# title", { type: "markdown" })
    // When an agent sends a view and a result_height with the editor height
    const out = setCellDimensionsTransition(
      partsOf([markdown]),
      BUFFER_ID,
      "a",
      {
        editorHeight: 86,
        resultHeight: 300,
        view: "result",
        compact: false,
      },
    )
    // Then only the editor height lands, and the views report null
    expect(out.parts.cells[0]).toMatchObject({
      topHeight: 86,
      topResized: true,
    })
    expect(out.parts.cells[0].bottomHeight).toBeUndefined()
    expect(out.parts.cells[0].preferredView).toBeUndefined()
    expect(out.result).toEqual({ preferred_view: null, view: null })
  })

  it("supports a genuine editor-only view in the wide tier", () => {
    const chart = cell("a", "SELECT 1", { mode: "draw" })
    const out = setCellDimensionsTransition(partsOf([chart]), BUFFER_ID, "a", {
      view: "editor",
      compact: false,
    })

    expect(out.parts.cells[0]).toMatchObject({
      preferredView: "editor",
    })
    expect(out.result).toEqual({
      preferred_view: "editor",
      view: "editor",
      tier: "wide",
    })
  })

  it("rejects chart result heights below the visual minimum", () => {
    const chart = cell("a", "SELECT 1", { mode: "draw" })
    expect(() =>
      setCellDimensionsTransition(partsOf([chart]), BUFFER_ID, "a", {
        resultHeight: 100,
      }),
    ).toThrow(/at least 240px/)
  })

  it("uses the mounted missing-result state for presentation and height", () => {
    const pending = cell("a", "SELECT 1", {
      lastRunStatus: "success",
      preferredView: "editor_result",
    })
    const out = setCellDimensionsTransition(
      partsOf([pending], {
        settings: {
          layoutMode: "grid",
          layout: [{ i: "a", x: 0, y: 0, w: 12, h: 19 }],
        },
      }),
      BUFFER_ID,
      "a",
      { compact: false, expectingResult: false },
    )

    expect(out.result).toEqual({
      preferred_view: "editor_result",
      view: "editor",
      tier: "wide",
    })
    expect(out.parts.settings.layout?.[0].h).toBe(5)
  })

  it("persists a result preference while a missing result falls back to editor", () => {
    const pending = cell("a", "SELECT 1", {
      lastRunStatus: "success",
      preferredView: "editor_result",
    })
    const out = setCellDimensionsTransition(
      partsOf([pending]),
      BUFFER_ID,
      "a",
      { view: "result", compact: false, expectingResult: false },
    )

    expect(out.parts.cells[0].preferredView).toBe("result")
    expect(out.result).toEqual({
      preferred_view: "result",
      view: "editor",
      tier: "wide",
      fallback: "requested_view_unavailable",
    })
  })
})

describe("setCellLayoutTransition", () => {
  const chart = cell("a", "SELECT 1", {
    mode: "draw",
    preferredView: "editor_result",
  })

  it("returns the projected live presentation after a width change", () => {
    const out = setCellLayoutTransition(
      partsOf([chart], {
        settings: {
          layoutMode: "grid",
          layout: [{ i: "a", x: 0, y: 0, w: 6, h: 10 }],
        },
      }),
      BUFFER_ID,
      "a",
      { x: 0, y: 0, w: 4, liveCompact: false, gridContainerWidth: 1200 },
    )

    expect(out.result).toEqual({
      grid: { x: 0, y: 0, w: 4 },
      preferred_view: "editor_result",
      view: "result",
      tier: "compact",
    })
  })

  it("omits effective presentation when no rendered geometry is available", () => {
    const out = setCellLayoutTransition(
      partsOf([chart], { settings: { layoutMode: "grid" } }),
      BUFFER_ID,
      "a",
      { x: 0, y: 0, w: 4 },
    )

    expect(out.result).toEqual({
      grid: { x: 0, y: 0, w: 4 },
      preferred_view: "editor_result",
    })
  })

  it("rejects placement that extends beyond the grid", () => {
    expect(() =>
      setCellLayoutTransition(
        partsOf([chart], { settings: { layoutMode: "grid" } }),
        BUFFER_ID,
        "a",
        { x: 11, y: 0, w: 2 },
      ),
    ).toThrow(NotebookToolError)
  })
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

  it("keeps a released cell's snapshot on a value change — hydration reconciles it", () => {
    // Given a released run cell (history only, result on disk) and a sibling
    const parts = partsOf([
      cell("a", "SELECT 1", { lastRunStatus: "success" }),
      cell("b", "SELECT 2"),
    ])
    // When an apply rewrites "a" and keeps "b"
    const out = applyNotebookStateTransition(parts, {
      cells: [
        { id: "a", value: "SELECT 99" },
        { id: "b", preserveValue: true },
      ],
    })
    // Then no snapshot deletion is requested — hydration reconciles the
    // persisted results by statement content on the next load
    expect(out.deleteSnapshots).toBeUndefined()
    expect(out.cleanup?.cellIds).toEqual([])
  })

  it("flags a live result that loses every statement in deleteSnapshots", () => {
    // Given a mounted run cell whose in-memory result matches its SQL
    const parts = partsOf([
      cell("a", "SELECT 1", {
        result: {
          results: [
            {
              type: "dql",
              query: "SELECT 1",
              columns: [{ name: "x", type: "INT" }],
              dataset: [[1]],
              count: 1,
            },
          ],
          activeResultIndex: 0,
          timestamp: 0,
        },
      }),
    ])
    // When an apply rewrites the SQL so no statement survives
    const out = applyNotebookStateTransition(parts, {
      cells: [{ id: "a", value: "SELECT 99" }],
    })
    // Then the frame collapses and the snapshot deletion is requested, so
    // disk agrees with the collapsed cell on every later reload
    expect(out.parts.cells[0].result).toBeNull()
    expect(out.deleteSnapshots?.cellIds).toEqual(["a"])
  })

  it("carries surviving statements' results through an apply rewrite", () => {
    // Given a mounted two-statement cell with both results in memory
    const dql = (query: string) => ({
      type: "dql" as const,
      query,
      columns: [{ name: "x", type: "INT" }],
      dataset: [[1]],
      count: 1,
    })
    const parts = partsOf([
      cell("a", "SELECT 1; SELECT 2", {
        result: {
          results: [dql("SELECT 1"), dql("SELECT 2")],
          activeResultIndex: 0,
          timestamp: 0,
        },
      }),
    ])
    // When an apply edits only the second statement
    const out = applyNotebookStateTransition(parts, {
      cells: [{ id: "a", value: "SELECT 1; SELECT 99" }],
    })
    // Then the unchanged statement keeps its result and nothing is deleted
    expect(out.parts.cells[0].result?.results).toEqual([dql("SELECT 1")])
    expect(out.deleteSnapshots).toBeUndefined()
  })

  it("omits deleteSnapshots when no run cell's value changed", () => {
    // Given a run cell whose value the apply preserves
    const parts = partsOf([cell("a", "SELECT 1", { lastRunStatus: "success" })])
    // When the apply keeps it verbatim
    const out = applyNotebookStateTransition(parts, {
      cells: [{ id: "a", preserveValue: true }],
    })
    // Then no snapshot deletion is requested
    expect(out.deleteSnapshots).toBeUndefined()
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

describe("setCellModeTransition", () => {
  it("asks the shell to cancel the cell's run when it enters draw mode", () => {
    // Given a run-mode cell (a run may be in flight)
    const parts = partsOf([cell("a", "select 1", { mode: "run" })])
    // When the cell switches to draw
    const out = setCellModeTransition(parts, BUFFER_ID, "a", "draw")
    // Then the shell is told to abort its in-flight run — the chart engine
    // owns the cell's result from here
    expect(out.cancelRuns?.cellIds).toEqual(["a"])
  })

  it("does not cancel runs when leaving draw mode or staying in it", () => {
    // Given a draw-mode cell
    const parts = partsOf([cell("a", "select 1", { mode: "draw" })])
    // When it switches back to run, or is re-set to draw
    const toRun = setCellModeTransition(parts, BUFFER_ID, "a", "run")
    const stillDraw = setCellModeTransition(parts, BUFFER_ID, "a", "draw")
    // Then neither carries a cancel request
    expect(toRun.cancelRuns).toBeUndefined()
    expect(stillDraw.cancelRuns).toBeUndefined()
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

  it("updateCell stamps topHeight from a changed SQL value", () => {
    // Given a three-line SQL edit to a plain cell
    const value = "SELECT 1\nFROM trades\nLIMIT 10"
    const out = updateCellTransition(partsOf([cell("a")]), BUFFER_ID, "a", {
      value,
    })

    // Then the patched cell carries the stamped editor height
    expect(out.parts.cells[0].topHeight).toBe(topHeightForSql(value))
  })

  it("updateCell leaves a user-resized topHeight pinned on value edits", () => {
    // Given a cell the user resized to a hard cap
    const resized = cell("a", "SELECT 1", { topHeight: 300, topResized: true })

    // When its SQL changes
    const out = updateCellTransition(partsOf([resized]), BUFFER_ID, "a", {
      value: "SELECT 2",
    })

    // Then the user's height stays
    expect(out.parts.cells[0].topHeight).toBe(300)
  })

  it("updateCell does not stamp topHeight on markdown value edits", () => {
    // Given a markdown cell edit (markdown heights are measured, not stamped)
    const md = cell("a", "# one", { type: "markdown" })
    const out = updateCellTransition(partsOf([md]), BUFFER_ID, "a", {
      value: "# one\ntwo\nthree",
    })

    // Then no height is stamped
    expect(out.parts.cells[0].topHeight).toBeUndefined()
  })

  const dqlOf = (query: string) => ({
    type: "dql" as const,
    query,
    columns: [{ name: "x", type: "INT" }],
    dataset: [[1]],
    count: 1,
  })

  it("updateCell carries surviving statements' results across a value edit", () => {
    // Given a mounted two-statement cell with both results in memory
    const ran = cell("a", "SELECT 1; SELECT 2", {
      result: {
        results: [dqlOf("SELECT 1"), dqlOf("SELECT 2")],
        activeResultIndex: 0,
        timestamp: 0,
      },
    })

    // When update_cell edits only the second statement
    const out = updateCellTransition(partsOf([ran]), BUFFER_ID, "a", {
      value: "SELECT 1; SELECT 99",
    })

    // Then the unchanged statement keeps its result, nothing is deleted
    expect(out.parts.cells[0].result?.results).toEqual([dqlOf("SELECT 1")])
    expect(out.deleteSnapshots).toBeUndefined()
  })

  it("updateCell collapses the frame and flags the snapshot when nothing survives", () => {
    // Given a mounted cell whose only statement is rewritten
    const ran = cell("a", "SELECT 1", {
      result: {
        results: [dqlOf("SELECT 1")],
        activeResultIndex: 0,
        timestamp: 0,
      },
    })

    // When update_cell replaces the SQL wholesale
    const out = updateCellTransition(partsOf([ran]), BUFFER_ID, "a", {
      value: "SELECT 99",
    })

    // Then the frame collapses, history carries, and the snapshot is flagged
    expect(out.parts.cells[0].result).toBeNull()
    expect(out.parts.cells[0].lastRunStatus).toBe("success")
    expect(out.deleteSnapshots?.cellIds).toEqual(["a"])
  })

  it("updateCell keeps a released cell's snapshot on a value edit", () => {
    // Given a released cell: run history only, results on disk
    const released = cell("a", "SELECT 1", { lastRunStatus: "success" })

    // When update_cell edits the SQL
    const out = updateCellTransition(partsOf([released]), BUFFER_ID, "a", {
      value: "SELECT 99",
    })

    // Then no snapshot deletion is requested — hydration reconciles it
    expect(out.deleteSnapshots).toBeUndefined()
    expect(out.parts.cells[0].lastRunStatus).toBe("success")
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
