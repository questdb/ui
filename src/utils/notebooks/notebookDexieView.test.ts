import { describe, expect, it } from "vitest"
import type { NotebookViewState } from "../../store/notebook"
import { migratePersistedNotebookView } from "./notebookDexieView"

const legacyView = (isViewMaximized?: boolean): NotebookViewState =>
  ({
    cells: [
      {
        id: "c",
        position: 0,
        value: "SELECT 1",
        ...(isViewMaximized !== undefined ? { isViewMaximized } : {}),
      },
    ],
  }) as unknown as NotebookViewState

describe("migratePersistedNotebookView preferred view", () => {
  it.each([
    [true, "result"],
    [false, "editor_result"],
    [undefined, "editor_result"],
  ] as const)("maps main's isViewMaximized=%s to %s", (legacy, paneView) => {
    const cell = migratePersistedNotebookView(legacyView(legacy)).cells[0]
    expect(cell.paneView).toBe(paneView)
    expect(cell).not.toHaveProperty("isViewMaximized")
  })

  it("removes pane preference state from markdown", () => {
    const view = {
      cells: [
        {
          id: "m",
          position: 0,
          value: "# Title",
          type: "markdown",
          paneView: "result",
          isViewMaximized: true,
        },
      ],
    } as unknown as NotebookViewState
    const cell = migratePersistedNotebookView(view).cells[0]
    expect(cell).not.toHaveProperty("paneView")
    expect(cell).not.toHaveProperty("isViewMaximized")
  })
})

describe("migratePersistedNotebookView markdown sub-state", () => {
  it("strips SQL-only draw and result state from markdown", () => {
    // Given a markdown cell an older import left carrying draw state
    const view = {
      cells: [
        {
          id: "m",
          position: 0,
          value: "# Title",
          type: "markdown",
          mode: "draw",
          chartConfig: { xColumn: null, queries: [null] },
          autoRefresh: 5000,
          bottomHeight: 350,
          bottomResized: true,
          result: { results: [], activeResultIndex: 0, timestamp: 0 },
          lastRunStatus: "success",
          lastRunError: "boom",
          topHeight: 86,
        },
      ],
    } as unknown as NotebookViewState
    // When the persisted view is migrated
    const cell = migratePersistedNotebookView(view).cells[0]
    // Then only markdown's own fields survive
    expect(cell).toEqual({
      id: "m",
      position: 0,
      value: "# Title",
      type: "markdown",
      topHeight: 86,
    })
  })

  it("keeps draw state on a SQL cell", () => {
    // Given a draw cell
    const view = {
      cells: [
        {
          id: "s",
          position: 0,
          value: "SELECT 1",
          mode: "draw",
          chartConfig: { xColumn: null, queries: [null] },
          autoRefresh: 5000,
          bottomHeight: 350,
        },
      ],
    } as unknown as NotebookViewState
    // When the persisted view is migrated
    const cell = migratePersistedNotebookView(view).cells[0]
    // Then its draw state is untouched
    expect(cell.mode).toBe("draw")
    expect(cell.chartConfig).toBeDefined()
    expect(cell.autoRefresh).toBe(5000)
    expect(cell.bottomHeight).toBe(350)
  })
})
