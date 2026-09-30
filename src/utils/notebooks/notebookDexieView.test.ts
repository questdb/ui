import "../../test/stubBrowserGlobals"
import { describe, expect, it } from "vitest"
import type { NotebookCell, NotebookViewState } from "../../store/notebook"
import { migratePersistedNotebookView } from "./notebookDexieView"
import { MAX_PANE_HEIGHT_PX } from "../../scenes/Editor/Notebook/cellSizing"

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
    // Given a persisted view from main carrying the legacy boolean
    const view = legacyView(legacy)

    // When the view is migrated
    const cell = migratePersistedNotebookView(view).cells[0]

    // Then the cell stores the preferred view and drops the boolean
    expect(cell.paneView).toBe(paneView)
    expect(cell).not.toHaveProperty("isViewMaximized")
  })

  it("folds a maximized cell's editor height into its result pane, once", () => {
    // Given a draw cell main showed maximized at editor + result height
    const view = {
      cells: [
        {
          id: "chart",
          position: 0,
          value: "SELECT 1",
          mode: "draw",
          topHeight: 152,
          bottomHeight: 350,
          topResized: true,
          isViewMaximized: true,
        },
      ],
    } as unknown as NotebookViewState

    // When it is read after the upgrade
    const migrated = migratePersistedNotebookView(view).cells[0]

    // Then the result pane keeps the size the cell had, pinned as resized
    expect(migrated).toMatchObject({
      paneView: "result",
      topHeight: 152,
      bottomHeight: 502,
      bottomResized: true,
    })

    // When the migrated row is read again (the flag is gone after a persist)
    const reread = migratePersistedNotebookView({
      cells: [migrated],
    } as unknown as NotebookViewState).cells[0]

    // Then nothing folds twice
    expect(reread).toEqual(migrated)
  })

  it("stops the folded result pane at the pane ceiling", () => {
    // Given a maximized cell whose editor and result heights sum past the ceiling
    const view = {
      cells: [
        {
          id: "chart",
          position: 0,
          value: "SELECT 1",
          mode: "draw",
          topHeight: 1800,
          bottomHeight: 1500,
          topResized: true,
          bottomResized: true,
          isViewMaximized: true,
        },
      ],
    } as unknown as NotebookViewState

    // When it is read after the upgrade
    const migrated = migratePersistedNotebookView(view).cells[0]

    // Then the result pane is clamped to the ceiling
    expect(migrated).toMatchObject({
      paneView: "result",
      bottomHeight: MAX_PANE_HEIGHT_PX,
      bottomResized: true,
    })
  })

  it("folds the default editor height when a maximized cell stored none", () => {
    // Given a maximized run cell whose editor kept its default height
    const view = {
      cells: [
        {
          id: "grid",
          position: 0,
          value: "SELECT 1",
          bottomHeight: 350,
          isViewMaximized: true,
        },
      ],
    } as unknown as NotebookViewState

    // When it is read after the upgrade
    const cell = migratePersistedNotebookView(view).cells[0]

    // Then the result pane keeps the size main showed: default editor + result
    expect(cell).toMatchObject({ paneView: "result", bottomHeight: 350 + 72 })
    expect(cell).not.toHaveProperty("topHeight")
  })

  it("folds the default chart height when a maximized chart stored no result height", () => {
    // Given a chart an agent made on main from an existing cell: maximized,
    // with an editor height and no result height
    const view = {
      cells: [
        {
          id: "chart",
          position: 0,
          value: "SELECT 1",
          mode: "draw",
          topHeight: 120,
          isViewMaximized: true,
        },
      ],
    } as unknown as NotebookViewState

    // When it is read after the upgrade
    const cell = migratePersistedNotebookView(view).cells[0]

    // Then the chart keeps the size main showed: editor + default chart height
    expect(cell).toMatchObject({ paneView: "result", bottomHeight: 120 + 350 })
  })

  it("keeps auto sizing for a maximized grid that stored no result height", () => {
    // Given a maximized run cell whose result pane sized itself to its rows
    const view = {
      cells: [
        {
          id: "grid",
          position: 0,
          value: "SELECT 1",
          topHeight: 120,
          isViewMaximized: true,
        },
      ],
    } as unknown as NotebookViewState

    // When it is read after the upgrade
    const cell = migratePersistedNotebookView(view).cells[0]

    // Then no result height is pinned; the rows still decide the pane size
    expect(cell).toMatchObject({ paneView: "result", topHeight: 120 })
    expect(cell).not.toHaveProperty("bottomHeight")
  })

  it("keeps the stored heights of a cell that was not maximized", () => {
    // Given a split cell with stored heights
    const view = {
      cells: [
        {
          id: "grid",
          position: 0,
          value: "SELECT 1",
          topHeight: 152,
          bottomHeight: 350,
          isViewMaximized: false,
        },
      ],
    } as unknown as NotebookViewState

    // When it is read
    const cell = migratePersistedNotebookView(view).cells[0]

    // Then both panes keep their size
    expect(cell).toMatchObject({
      paneView: "editor_result",
      topHeight: 152,
      bottomHeight: 350,
    })
  })

  it("removes pane preference state from markdown", () => {
    // Given a markdown cell carrying pane preference state
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

    // When the view is migrated
    const cell = migratePersistedNotebookView(view).cells[0]

    // Then the markdown cell keeps no pane preference
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
          highlightConfig: { identityColumns: ["symbol"], rules: [] },
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
          highlightConfig: { identityColumns: ["symbol"], rules: [] },
          autoRefresh: 5000,
          bottomHeight: 350,
        },
      ],
    } as unknown as NotebookViewState
    // When the persisted view is migrated
    const cell = migratePersistedNotebookView(view).cells[0]
    // Then its draw state is untouched
    expect(cell.highlightConfig).toEqual({
      identityColumns: ["symbol"],
      rules: [],
    })
    expect(cell.mode).toBe("draw")
    expect(cell.chartConfig).toBeDefined()
    expect(cell.autoRefresh).toBe(5000)
    expect(cell.bottomHeight).toBe(350)
  })
})

const cell = (id: string, highlightConfig: unknown): NotebookCell =>
  ({ id, position: 0, value: "select 1", highlightConfig }) as NotebookCell

describe("migratePersistedNotebookView", () => {
  it("drops a malformed highlight config on load and keeps a valid one", () => {
    // Given a persisted view with one valid config and one with an unknown rule
    const valid = {
      identityColumns: ["symbol"],
      rules: [
        {
          id: "r1",
          kind: "value",
          enabled: true,
          target: { kind: "column", name: "price" },
          display: "always",
          appliesTo: "cell",
          condition: { op: "gt", value: 100 },
          color: "dataSeries2",
        },
      ],
    }
    const persisted: NotebookViewState = {
      cells: [
        cell("ok", valid),
        cell("bad", { identityColumns: [], rules: [{ kind: "nope" }] }),
      ],
    }

    // When the view is read from storage
    const view = migratePersistedNotebookView(persisted)

    // Then the valid rules survive and the malformed config is gone
    expect(view.cells[0].highlightConfig).toEqual(valid)
    expect("highlightConfig" in view.cells[1]).toBe(false)
  })
})
