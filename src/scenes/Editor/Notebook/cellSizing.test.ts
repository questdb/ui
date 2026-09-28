import { describe, expect, it } from "vitest"
import {
  agentCellDimensionsPatch,
  discardCellResult,
  agentCellPaneDimensions,
  agentCellPresentation,
  resolveCellPaneLayout,
  paneHeightsFromGridRows,
  computeAgentCellGridH,
  computeCellGridH,
  computeCellHeights,
  computeCellGridBounds,
  computeResultBottomHeight,
  DEFAULT_CHART_BOTTOM_HEIGHT,
  gridBoxRowsChange,
  hasAgentVisibleCellHeightChanged,
  isDoubleView,
  isExpectingResult,
  releaseCellResultPatch,
  MIN_MARKDOWN_HEIGHT_PX,
  cellModeChangePatch,
  partitionCellHeights,
  topHeightForSql,
  patchCellRunResult,
  snapMarkdownTopHeight,
} from "./cellSizing"
import { statementKeysFor } from "./statementIdentity"
import type { CellResult, NotebookCell } from "../../../store/notebook"

const cell = (
  id: string,
  value = "",
  result?: NotebookCell["result"],
): NotebookCell => ({
  id,
  position: 0,
  value,
  result,
})

describe("discardCellResult", () => {
  const ranCell = (): NotebookCell => ({
    ...cell("a", "select 1", {
      results: [],
      activeResultIndex: 0,
      timestamp: 0,
    }),
    mode: "draw",
    lastRunStatus: "success",
    bottomHeight: 420,
  })

  it("keeps a user-pinned result height for the next run", () => {
    // Given a ran cell whose result pane the user resized
    const pinned: NotebookCell = { ...ranCell(), bottomResized: true }

    // When its result is discarded
    const next = discardCellResult(pinned)

    // Then the run outcome is gone and the pinned height survives
    expect(next.result).toBeUndefined()
    expect(next.lastRunStatus).toBeUndefined()
    expect(next).not.toHaveProperty("mode")
    expect(next).toMatchObject({ bottomHeight: 420, bottomResized: true })
  })

  it("drops an unpinned result height with the result", () => {
    // Given a ran cell whose result pane was never resized
    const unpinned = ranCell()

    // When its result is discarded
    const next = discardCellResult(unpinned)

    // Then the next result sizes itself again
    expect(next.bottomHeight).toBeUndefined()
  })
})

describe("isDoubleView", () => {
  it("returns true for run cell with a result", () => {
    expect(
      isDoubleView({
        id: "x",
        position: 0,
        value: "",
        result: { results: [], activeResultIndex: 0, timestamp: 0 },
      }),
    ).toBe(true)
  })
  it("returns false for run cell with no result", () => {
    expect(isDoubleView({ id: "x", position: 0, value: "" })).toBe(false)
  })
  it("returns true for draw cell, whether chart-expanded or not", () => {
    // Given a draw cell, with and without an expanded chart
    // When the double view is checked
    // Then both are double-view
    expect(
      isDoubleView({ id: "x", position: 0, value: "", mode: "draw" }),
    ).toBe(true)
    expect(
      isDoubleView({
        id: "x",
        position: 0,
        value: "",
        mode: "draw",
        paneView: "result",
      }),
    ).toBe(true)
  })
})

describe("computeResultBottomHeight", () => {
  // Layout constants (kept in sync with notebookUtils.ts):
  //   TAB_BAR_PX            = 40
  //   NOTIFICATION_PX       = 44
  //   RESULT_ACTIONS_BAR_PX = 36
  //   HEADER_HEIGHT         = 44
  //   ROW_HEIGHT            = 30
  //   MAX_RESERVED_ROWS     = 10

  const heightForResult = (result: CellResult | null | undefined) =>
    computeResultBottomHeight(
      result,
      (result?.results ?? []).map(({ query }) => query).join(";\n"),
    )

  it("null/undefined/empty result → notification-only", () => {
    expect(heightForResult(null)).toBe(44)
    expect(heightForResult(undefined)).toBe(44)
    expect(
      heightForResult({
        results: [],
        activeResultIndex: 0,
        timestamp: 0,
      }),
    ).toBe(44)
  })

  it("single error → notification-only", () => {
    expect(
      heightForResult({
        results: [{ type: "error", query: "X", error: "boom" }],
        activeResultIndex: 0,
        timestamp: 0,
      }),
    ).toBe(44)
  })

  it("single DDL/DML/notice → notification-only", () => {
    for (const type of ["ddl", "dml"] as const) {
      expect(
        heightForResult({
          results: [{ type, query: "X" }],
          activeResultIndex: 0,
          timestamp: 0,
        }),
      ).toBe(44)
    }
  })

  it("single DQL with columns but 0 rows → notification + actions bar + header (no rows)", () => {
    // The column headers show even with no rows: 44 + 36 + 44 + 0*30 = 124.
    expect(
      heightForResult({
        results: [
          {
            type: "dql",
            query: "SELECT 1",
            columns: [{ name: "x", type: "INT" }],
            dataset: [],
            count: 0,
          },
        ],
        activeResultIndex: 0,
        timestamp: 0,
      }),
    ).toBe(124)
  })

  it("single DQL with no columns → notification-only", () => {
    expect(
      heightForResult({
        results: [
          {
            type: "dql",
            query: "SELECT 1",
            columns: [],
            dataset: [],
            count: 0,
          },
        ],
        activeResultIndex: 0,
        timestamp: 0,
      }),
    ).toBe(44)
  })

  it("single DQL with N rows → notification + header + N×row (N capped at 10)", () => {
    const make = (rowCount: number) => ({
      results: [
        {
          type: "dql" as const,
          query: "SELECT 1",
          columns: [{ name: "x", type: "INT" }],
          dataset: Array.from({ length: rowCount }, () => [1]),
          count: rowCount,
        },
      ],
      activeResultIndex: 0,
      timestamp: 0,
    })
    // 1 row: 44 + 36 + 44 + 1*30 = 154
    expect(heightForResult(make(1))).toBe(154)
    // 5 rows: 44 + 36 + 44 + 5*30 = 274
    expect(heightForResult(make(5))).toBe(274)
    // 10 rows: 44 + 36 + 44 + 10*30 = 424
    expect(heightForResult(make(10))).toBe(424)
    // 50 rows: cap at 10 → still 424
    expect(heightForResult(make(50))).toBe(424)
  })

  it("one executed DQL in a multi-statement cell adds tabs but tight-fits its rows", () => {
    // The result array is compact (only SELECT 2 ran), but the rendered frame
    // has two tabs: SELECT 1 is "Not run" and SELECT 2 owns the result.
    const result = {
      results: [
        {
          type: "dql" as const,
          query: "select 2",
          columns: [{ name: "2", type: "INT" }],
          dataset: [[2]],
          count: 1,
        },
      ],
      activeResultIndex: 0,
      timestamp: 0,
    }

    // 40 tab + 44 notification + 36 actions + 44 header + 1*30 row = 194.
    expect(computeResultBottomHeight(result, "select 1;\nselect 2")).toBe(194)
  })

  it("keeps the grid block reserved while the active tab is an unexecuted statement", () => {
    // Given a two-statement cell where only the second statement ran, and the
    // user has selected the "Not run" tab, so the active slot holds no result
    const result = {
      results: [
        {
          type: "dql" as const,
          query: "select 2",
          columns: [{ name: "2", type: "INT" }],
          dataset: [[2]],
          count: 1,
        },
      ],
      activeResultIndex: 0,
      activeStatementKey: statementKeysFor(["select 1"])[0],
      timestamp: 0,
    }

    // When sizing the bottom slot for that frame
    // Then it still reserves the executed result's grid rather than collapsing
    // to tab bar + notification (84), which would clip the visible grid.
    expect(computeResultBottomHeight(result, "select 1;\nselect 2")).toBe(194)
  })

  it("one executed non-grid result in a multi-statement cell still includes its tabs", () => {
    expect(
      computeResultBottomHeight(
        {
          results: [{ type: "ddl", query: "create table x (n int)" }],
          activeResultIndex: 0,
          timestamp: 0,
        },
        "create table x (n int);\nselect * from x",
      ),
    ).toBe(84)
  })

  it("multi-statement, first DQL with rows → tab + notification + header + 10 rows", () => {
    // 40 + 44 + 36 + 44 + 10*30 = 464
    expect(
      heightForResult({
        results: [
          {
            type: "dql",
            query: "Q1",
            columns: [{ name: "x", type: "INT" }],
            dataset: [[1]],
            count: 1,
          },
          { type: "ddl", query: "Q2" },
        ],
        activeResultIndex: 0,
        timestamp: 0,
      }),
    ).toBe(464)
  })

  it("multi-statement with any DQL tab reserves the full grid block", () => {
    // The first tab is an error, but the active second tab renders a grid.
    // Reserve the same stable multi-tab height: 40 + 44 + 36 + 44 + 10*30.
    expect(
      heightForResult({
        results: [
          { type: "error", query: "Q1", error: "boom" },
          {
            type: "dql",
            query: "Q2",
            columns: [{ name: "x", type: "INT" }],
            dataset: [[1]],
            count: 1,
          },
        ],
        activeResultIndex: 1,
        timestamp: 0,
      }),
    ).toBe(464)
  })

  it("multi-statement, first DQL with columns but 0 rows → tab + full grid block", () => {
    // The first query shows its column headers, so we reserve the grid block
    // like any DQL-first script: 40 + 44 + 36 + 44 + 10*30 = 464.
    expect(
      heightForResult({
        results: [
          {
            type: "dql",
            query: "Q1",
            columns: [{ name: "x", type: "INT" }],
            dataset: [],
            count: 0,
          },
          {
            type: "dql",
            query: "Q2",
            columns: [{ name: "x", type: "INT" }],
            dataset: [[1]],
            count: 1,
          },
        ],
        activeResultIndex: 0,
        timestamp: 0,
      }),
    ).toBe(464)
  })
})

describe("computeCellHeights", () => {
  const cell = (over = {}) => ({ id: "x", position: 0, value: "", ...over })

  it("single-view (run, no result): default editor, zero bottom", () => {
    expect(computeCellHeights(cell())).toEqual({
      topHeight: 72,
      bottomHeight: 0,
    })
  })
  it("uses persisted topHeight / bottomHeight when present", () => {
    expect(
      computeCellHeights(
        cell({
          topHeight: 200,
          bottomHeight: 300,
          result: { results: [], activeResultIndex: 0, timestamp: 0 },
        }),
      ),
    ).toEqual({ topHeight: 200, bottomHeight: 300 })
  })
  it("draw cell defaults the bottom to the chart height", () => {
    expect(computeCellHeights(cell({ mode: "draw" }))).toEqual({
      topHeight: 72,
      bottomHeight: 350,
    })
  })
  it("double-view (empty result) floors the notification bottom to the pane minimum", () => {
    // Given a run cell with an empty result
    // When the heights are computed
    // Then the bottom is floored to the pane minimum
    // The tight content height is 44 (notification bar only); the visible
    // pane never renders below MIN_BOTTOM_HEIGHT_PX.
    expect(
      computeCellHeights(
        cell({ result: { results: [], activeResultIndex: 0, timestamp: 0 } }),
      ),
    ).toEqual({ topHeight: 72, bottomHeight: 100 })
  })
  it("expectingResult reserves the result area when bottomHeight is unset", () => {
    expect(
      computeCellHeights(cell({ lastRunStatus: "success" }), {
        expectingResult: true,
      }),
    ).toEqual({ topHeight: 72, bottomHeight: 424 })
  })
  it("live drag overrides win over persisted values", () => {
    expect(
      computeCellHeights(
        cell({
          topHeight: 200,
          bottomHeight: 300,
          result: { results: [], activeResultIndex: 0, timestamp: 0 },
        }),
        { liveTopHeight: 111, liveBottomHeight: 222 },
      ),
    ).toEqual({ topHeight: 111, bottomHeight: 222 })
  })
  it("keeps the bottom at zero in single-view regardless of live value", () => {
    expect(computeCellHeights(cell(), { liveBottomHeight: 999 })).toEqual({
      topHeight: 72,
      bottomHeight: 0,
    })
  })
})

describe("agentCellPaneDimensions", () => {
  it("reports a stored result pin even when a run result is not loaded", () => {
    // Given a cell with a pinned result height and a run status but no loaded result
    // When the agent dimensions are read
    // Then the result pin is reported
    expect(
      agentCellPaneDimensions({
        id: "x",
        position: 0,
        value: "SELECT 1",
        bottomHeight: 400,
        bottomResized: true,
        lastRunStatus: "success",
      }),
    ).toEqual({ editorHeight: "auto", resultHeight: 400 })
  })

  it("reports auto for unpinned panes and normalizes legacy pins", () => {
    // Given an unpinned cell and a cell pinned below the minimums
    // When the agent dimensions are read
    // Then the unpinned panes read auto and the legacy pins clamp to the minimums
    expect(
      agentCellPaneDimensions({ id: "x", position: 0, value: "SELECT 1" }),
    ).toEqual({ editorHeight: "auto", resultHeight: "auto" })
    expect(
      agentCellPaneDimensions({
        id: "x",
        position: 0,
        value: "SELECT 1",
        topHeight: 1,
        topResized: true,
        bottomHeight: 1,
        bottomResized: true,
      }),
    ).toEqual({ editorHeight: 72, resultHeight: 100 })
  })
})

describe("partitionCellHeights", () => {
  it("keeps the requested top and gives the remainder to the bottom", () => {
    expect(partitionCellHeights(300, 200, 72, 88)).toEqual({
      top: 200,
      bottom: 100,
    })
  })
  it("raises the top to its minimum when requested below it", () => {
    expect(partitionCellHeights(300, 40, 72, 88)).toEqual({
      top: 72,
      bottom: 228,
    })
  })
  it("shrinks the top once the bottom would drop below its minimum", () => {
    expect(partitionCellHeights(300, 260, 72, 88)).toEqual({
      top: 212,
      bottom: 88,
    })
  })
})

describe("computeCellGridH", () => {
  it("single-view (run, no result): topHeight + chrome rounded up", () => {
    // 72 + 56 = 128 → ceil(128/50) = 3
    expect(computeCellGridH({ id: "x", position: 0, value: "" }, 50)).toBe(3)
  })
  it("double-view (run with empty result): notification bottom floored to the pane minimum", () => {
    // Given a run cell with an empty result
    // When the grid height is computed at a 50px row
    // Then the bottom is floored to the pane minimum
    // result.results = [] (empty after run) → tight bottom is 44, floored to
    // MIN_BOTTOM_HEIGHT_PX (100) so render, bounds and save agree.
    // 72 + 50 + 100 = 222 → ceil(222/50) = 5
    expect(
      computeCellGridH(
        {
          id: "x",
          position: 0,
          value: "",
          result: { results: [], activeResultIndex: 0, timestamp: 0 },
        },
        50,
      ),
    ).toBe(5)
  })
  it("respects explicit topHeight and bottomHeight overrides", () => {
    // Split chrome 50: 200 + 50 + 300 = 550 → ceil(550/50) = 11
    expect(
      computeCellGridH(
        {
          id: "x",
          position: 0,
          value: "",
          topHeight: 200,
          bottomHeight: 300,
          result: { results: [], activeResultIndex: 0, timestamp: 0 },
        },
        50,
      ),
    ).toBe(11)
  })
  it("draw cell uses chart default 350 when bottomHeight is unset", () => {
    // 72 + 56 + 350 = 478 → ceil(478/50) = 10
    expect(
      computeCellGridH({ id: "x", position: 0, value: "", mode: "draw" }, 50),
    ).toBe(10)
  })
  it("returns at least 1 row even for an empty cell", () => {
    expect(
      computeCellGridH({ id: "x", position: 0, value: "", topHeight: 0 }, 50),
    ).toBeGreaterThanOrEqual(1)
  })
  it("accounts for marginY (inter-row gaps from react-grid-layout)", () => {
    // Same cell as the "respects explicit … overrides" test above
    // (topHeight=200, bottomHeight=300, split chrome=50 → totalPx=550).
    // With rowHeight=10 and NO margin: 550/10 = 55 rows. With marginY=20,
    // each row occupies (10+20)=30 px effective, so h = ceil((550+20)/30)
    // = ceil(570/30) = 19. Rendered px = 19*10 + 18*20 = 190 + 360 = 550,
    // an exact fit for the 550-px content. Without the marginY term, h
    // would be 55 → rendered 55*10 + 54*20 = 1630 px (~3× too tall).
    expect(
      computeCellGridH(
        {
          id: "x",
          position: 0,
          value: "",
          topHeight: 200,
          bottomHeight: 300,
          result: { results: [], activeResultIndex: 0, timestamp: 0 },
        },
        10,
        20,
      ),
    ).toBe(19)
  })
  it("expectingResult reserves the result area when bottomHeight is unset", () => {
    // RESERVED_RESULT_BOTTOM_HEIGHT = 44 + 36 + 44 + 10*30 = 424; an
    // expecting cell renders split, so chrome is 50.
    // 72 + 50 + 424 = 546 → ceil(546/50) = 11
    expect(
      computeCellGridH(
        { id: "x", position: 0, value: "", lastRunStatus: "success" },
        50,
        0,
        true,
      ),
    ).toBe(11)
  })
  it("expectingResult uses the cell's own bottomHeight when set", () => {
    // 72 + 56 + 300 = 428 → ceil(428/50) = 9
    expect(
      computeCellGridH(
        {
          id: "x",
          position: 0,
          value: "",
          bottomHeight: 300,
          lastRunStatus: "success",
        },
        50,
        0,
        true,
      ),
    ).toBe(9)
  })
  it("expectingResult is ignored once a result is present (double-view wins)", () => {
    // Given a run cell with an empty result
    // When the grid height is computed with expectingResult set
    // Then the present result decides the height
    // Same as the "double-view (run with empty result)" case: bottom = 100.
    expect(
      computeCellGridH(
        {
          id: "x",
          position: 0,
          value: "",
          result: { results: [], activeResultIndex: 0, timestamp: 0 },
        },
        50,
        0,
        true,
      ),
    ).toBe(5)
  })
  it("split cells carry the 6px divider on top of the base chrome", () => {
    // Base chrome alone would land exactly on 8 rows (72 + 104 + 44 = 220px
    // = 8×10 + 7×20); the in-flow editor/result divider tips it to 9.
    expect(
      computeCellGridH(
        {
          id: "x",
          position: 0,
          value: "",
          topHeight: 72,
          bottomHeight: 104,
          result: { results: [], activeResultIndex: 0, timestamp: 0 },
        },
        10,
        20,
      ),
    ).toBe(9)
  })
  it("editor-hidden cells reserve only the result pane", () => {
    // Given a result-only cell with a remembered editor height
    // When the grid height is computed
    // Then only the result pane and the chrome count
    // The editor's 72px allocation is remembered but removed from the visible
    // footprint: 104px result + 44px chrome snaps to 6 rows.
    expect(
      computeCellGridH(
        {
          id: "x",
          position: 0,
          value: "",
          topHeight: 72,
          bottomHeight: 104,
          paneView: "result",
          result: { results: [], activeResultIndex: 0, timestamp: 0 },
        },
        10,
        20,
      ),
    ).toBe(6)
  })

  it("derives height from exactly the visible pane", () => {
    // Given a cell with distinct editor and result heights
    const cell: NotebookCell = {
      id: "x",
      position: 0,
      value: "",
      topHeight: 200,
      bottomHeight: 300,
      result: { results: [], activeResultIndex: 0, timestamp: 0 },
    }

    // When the grid height is computed per pane layout
    // Then each layout counts only its visible panes
    // Editor: 200 + 44 chrome = 244px → 9 rows (250px rendered).
    expect(computeCellGridH({ ...cell, result: undefined }, 10, 20)).toBe(9)
    // Result: 300 + 44 chrome = 344px → 13 rows (370px rendered).
    expect(computeCellGridH({ ...cell, paneView: "result" }, 10, 20)).toBe(13)
    // Wide split retains both panes and the 6px divider: 550px → 19 rows.
    expect(computeCellGridH(cell, 10, 20)).toBe(19)
  })
})

describe("resolveCellPaneLayout", () => {
  const withResult = (over: Partial<NotebookCell> = {}): NotebookCell => ({
    id: "x",
    position: 0,
    value: "",
    result: { results: [], activeResultIndex: 0, timestamp: 0 },
    ...over,
  })

  it("shows only the editor when no result exists", () => {
    // Given a cell without a result
    const cell: NotebookCell = { id: "x", position: 0, value: "" }
    // When the layout is resolved
    // Then only the editor shows
    expect(resolveCellPaneLayout(cell, false)).toBe("editor")
  })

  it("uses the authoritative preference once a result exists", () => {
    // Given cells with a result, with and without a stored pane view
    // When the layout is resolved
    // Then the stored preference decides the layout
    expect(resolveCellPaneLayout(withResult(), false)).toBe("split")
    expect(
      resolveCellPaneLayout(withResult({ paneView: "result" }), false),
    ).toBe("result")
  })
})

describe("agentCellPresentation", () => {
  const chart = (over: Partial<NotebookCell> = {}): NotebookCell => ({
    id: "x",
    position: 0,
    value: "SELECT 1",
    mode: "draw",
    paneView: "editor_result",
    ...over,
  })

  it("reports the stored pane view once a run outcome exists", () => {
    // Given a chart cell with different stored pane views
    // When the agent presentation is read
    // Then the stored view is reported and an unset view reads as editor_result
    expect(agentCellPresentation(chart())).toEqual({
      view: "editor_result",
      mode: "draw",
    })
    expect(agentCellPresentation(chart({ paneView: "result" }))).toEqual({
      view: "result",
      mode: "draw",
    })
    expect(agentCellPresentation(chart({ paneView: undefined }))).toEqual({
      view: "editor_result",
      mode: "draw",
    })
  })

  it("reports editor while the cell has nothing to show", () => {
    // Given a run cell with no result and varying run history
    // When the agent presentation is read
    // Then it reads editor until a run outcome exists
    expect(agentCellPresentation(chart({ mode: undefined }))).toEqual({
      view: "editor",
      mode: null,
    })
    expect(
      agentCellPresentation(chart({ mode: undefined, lastRunStatus: "none" })),
    ).toEqual({ view: "editor", mode: null })
    expect(
      agentCellPresentation(
        chart({ mode: undefined, lastRunStatus: "success" }),
      ),
    ).toEqual({ view: "editor_result", mode: "run" })
  })

  it("reports editor when a run-marked result is known missing", () => {
    // Given a run cell whose stored view is result and whose run succeeded
    const releasedRun = chart({
      mode: undefined,
      lastRunStatus: "success",
      paneView: "result",
    })

    // When the presentation is read with each result status
    // Then a missing run result collapses to editor while a chart keeps its view
    expect(agentCellPresentation(releasedRun, "unrequested")).toEqual({
      view: "result",
      mode: "run",
    })
    expect(agentCellPresentation(releasedRun, "missing")).toEqual({
      view: "editor",
      mode: null,
    })
    expect(agentCellPresentation(chart(), "missing")).toEqual({
      view: "editor_result",
      mode: "draw",
    })
  })

  it("reports a null view for a markdown cell", () => {
    // Given a markdown cell
    // When the agent presentation is read
    // Then it has no view and no mode
    expect(
      agentCellPresentation(chart({ mode: undefined, type: "markdown" })),
    ).toEqual({ view: null, mode: null })
  })
})

describe("computeCellGridBounds", () => {
  const result = { results: [], activeResultIndex: 0, timestamp: 0 }

  it("reserves the split editor's current height plus the result minimum", () => {
    // Given a split cell with a 400px editor and a result
    const cell: NotebookCell = {
      id: "x",
      position: 0,
      value: "",
      topHeight: 400,
      bottomHeight: 300,
      result,
    }

    // When the grid bounds are computed
    // Then the minimum reserves the editor height plus the result minimum
    // 400px editor + 100px result minimum + 50px split chrome = 550px,
    // which is exactly 19 rows at rowHeight=10 and marginY=20.
    expect(computeCellGridBounds(cell, 10, 20).minH).toBe(19)
  })

  it("does not reserve the remembered editor height when it is hidden", () => {
    // Given a result-only cell with a remembered editor height
    const cell: NotebookCell = {
      id: "x",
      position: 0,
      value: "",
      topHeight: 400,
      bottomHeight: 300,
      paneView: "result",
      result,
    }

    // When the grid bounds are computed
    // Then the minimum covers only the result pane
    // 100px result minimum + 44px base chrome requires 6 rows.
    expect(computeCellGridBounds(cell, 10, 20).minH).toBe(6)
  })

  it("uses the chart-specific result minimum", () => {
    // Given a split draw cell
    const cell: NotebookCell = {
      id: "x",
      position: 0,
      value: "",
      mode: "draw",
      topHeight: 400,
      bottomHeight: 350,
    }

    // When the grid bounds are computed
    // Then the minimum uses the chart floor
    // 400px editor + 296px chart minimum + 50px split chrome requires 26 rows.
    expect(computeCellGridBounds(cell, 10, 20).minH).toBe(26)
  })

  it("uses only the visible pane minimum for editor-only and result-only layouts", () => {
    // Given a cell with a result
    const cell: NotebookCell = {
      id: "x",
      position: 0,
      value: "",
      topHeight: 400,
      bottomHeight: 300,
      result,
    }

    // When the grid bounds are computed per single-pane layout
    // Then each minimum covers only its visible pane
    expect(
      computeCellGridBounds({ ...cell, result: undefined }, 10, 20).minH,
    ).toBe(5)
    expect(
      computeCellGridBounds({ ...cell, paneView: "result" }, 10, 20).minH,
    ).toBe(6)
  })

  it("keeps minH ≤ h ≤ maxH for every in-bounds cell state", () => {
    // Given the full matrix of pane states: notification-only and gridded
    // results, charts (fresh and errored render alike), hydrating, and
    // editor-only — at the default and at a tall editor.
    const dql = {
      results: [
        {
          type: "dql" as const,
          query: "SELECT 1",
          columns: [{ name: "x", type: "INT" }],
          dataset: [[1]],
          count: 1,
        },
      ],
      activeResultIndex: 0,
      timestamp: 0,
    }
    const base = { id: "x", position: 0, value: "SELECT 1" }
    const scenarios: { cell: NotebookCell; expectingResult?: boolean }[] = [
      { cell: { ...base, result } },
      { cell: { ...base, result: dql } },
      { cell: { ...base, result: dql, paneView: "result" } },
      { cell: { ...base, result, paneView: "result" } },
      { cell: { ...base, mode: "draw", paneView: "result" } },
      { cell: { ...base, mode: "draw" } },
      { cell: { ...base, lastRunStatus: "success" }, expectingResult: true },
      { cell: { ...base } },
      { cell: { ...base, topHeight: 900, result } },
      { cell: { ...base, topHeight: 900, bottomHeight: 2400, result: dql } },
    ]
    // When deriving the grid bounds
    // Then the height always sits inside its own bounds
    for (const { cell, expectingResult } of scenarios) {
      const { h, minH, maxH } = computeCellGridBounds(
        cell,
        10,
        20,
        expectingResult ?? false,
      )
      expect(minH).toBeLessThanOrEqual(h)
      expect(h).toBeLessThanOrEqual(maxH)
    }
  })
})

describe("markdown cell grid lattice", () => {
  const markdown = (patch: Partial<NotebookCell> = {}): NotebookCell => ({
    id: "m",
    position: 0,
    value: "",
    type: "markdown",
    ...patch,
  })

  it("snapMarkdownTopHeight snaps content height up to the next lattice point", () => {
    // Given 10px rows, 20px margins and 44px markdown chrome, on-lattice
    // content heights are 56, 86, 116, …
    // When the measured content falls between points
    // Then it snaps up to the next one
    expect(snapMarkdownTopHeight(36)).toBe(56)
    expect(snapMarkdownTopHeight(59)).toBe(86)
  })

  it("snapMarkdownTopHeight is idempotent on lattice points", () => {
    expect(snapMarkdownTopHeight(56)).toBe(56)
    expect(snapMarkdownTopHeight(86)).toBe(86)
  })

  it("snapMarkdownTopHeight floors at the markdown minimum", () => {
    expect(snapMarkdownTopHeight(0)).toBe(MIN_MARKDOWN_HEIGHT_PX)
    expect(snapMarkdownTopHeight(10)).toBe(MIN_MARKDOWN_HEIGHT_PX)
  })

  it("a fresh markdown cell derives an exact 4-row box from its 56px default", () => {
    // Given a markdown cell with no stored topHeight
    // When grid h derives from the 56px default + 44px markdown chrome
    // Then 56 + 44 = 100px = exactly 4 rows (4×10 + 3×20), zero slack
    expect(computeCellGridH(markdown(), 10, 20)).toBe(4)
  })

  it("markdown carries the base chrome only — its box lands exactly", () => {
    // 56 + 44 = 100px = exactly 4 rows; markdown never adds the divider
    expect(computeCellGridH(markdown({ topHeight: 56 }), 10, 20)).toBe(4)
  })

  it("paneHeightsFromGridRows back-solves markdown rows with markdown chrome", () => {
    // Given a markdown cell rendered at 4 rows
    const cell = markdown({ topHeight: 56 })
    // When the user drags the cell to 7 rows (7×10 + 6×20 = 190px box)
    const patch = paneHeightsFromGridRows(cell, 7, 10, 20)
    // Then content = 190 − 44 = 146, pinned like a manual drag
    expect(patch).toEqual({ topHeight: 146, topResized: true })
  })

  it("paneHeightsFromGridRows floors a tiny markdown drag at the markdown minimum", () => {
    // Given a markdown cell rendered at 4 rows
    const cell = markdown({ topHeight: 56 })
    // When the user drags the cell down to 2 rows (40px box < 44px chrome)
    const patch = paneHeightsFromGridRows(cell, 2, 10, 20)
    // Then the content floors at the markdown minimum, not the SQL 72px
    expect(patch).toEqual({
      topHeight: MIN_MARKDOWN_HEIGHT_PX,
      topResized: true,
    })
  })
})

describe("gridBoxRowsChange", () => {
  const runCell: NotebookCell = {
    id: "x",
    position: 0,
    value: "",
    topHeight: 72,
  }
  const dragTo = (height: number) => ({ topHeight: height, topResized: true })

  it("never asks the store to follow a drag in list layout", () => {
    // Given a list cell dragged far past its current height
    // When each pointer move is checked
    // Then the drag stays local until drop
    expect(gridBoxRowsChange(runCell, dragTo(400), "list", false)).toBe(false)
  })

  it("asks the store to follow a grid drag once per row the box gains", () => {
    // Given a grid cell dragged 60 px taller, one pixel per pointer move
    const start = runCell.topHeight!
    const end = start + 60
    let cell = runCell
    let storeWrites = 0

    // When each pointer move is checked against the last committed cell
    for (let height = start + 1; height <= end; height++) {
      if (gridBoxRowsChange(cell, dragTo(height), "grid", false)) {
        storeWrites++
        cell = { ...cell, ...dragTo(height) }
      }
    }

    // Then the store is written only at row boundaries, not per pixel
    const rowsGained =
      computeAgentCellGridH({ ...runCell, topHeight: end }) -
      computeAgentCellGridH(runCell)
    expect(rowsGained).toBeGreaterThan(0)
    expect(storeWrites).toBe(rowsGained)
    expect(storeWrites).toBeLessThan(end - start)
  })
})

describe("hasAgentVisibleCellHeightChanged", () => {
  const runCell: NotebookCell = {
    id: "x",
    position: 0,
    value: "",
    topHeight: 72,
  }

  it("reports a pinned editor height the agent would read differently, in list layout too", () => {
    // Given a list cell whose editor is dragged from 72 to 300 px
    const patch = { topHeight: 300, topResized: true }

    // When the resize is checked against the agent-visible dimensions
    // Then the new editor_height stales the agent
    expect(hasAgentVisibleCellHeightChanged(runCell, patch)).toBe(true)
  })

  it("reports a pinned result height change", () => {
    // Given a cell with a result whose pane is dragged taller
    const splitCell: NotebookCell = {
      ...runCell,
      bottomHeight: 300,
      bottomResized: true,
      result: { results: [], activeResultIndex: 0, timestamp: 0 },
    }

    // When the resize is checked
    // Then the new result_height stales the agent
    expect(
      hasAgentVisibleCellHeightChanged(splitCell, {
        bottomHeight: 400,
        bottomResized: true,
      }),
    ).toBe(true)
  })

  it("ignores a drag that ends where it started", () => {
    // Given the cell a split drag started from, pinned at 200 px
    const startCell: NotebookCell = {
      ...runCell,
      topHeight: 200,
      topResized: true,
    }

    // When the drop height equals the start height
    // Then the round trip is not an edit
    expect(
      hasAgentVisibleCellHeightChanged(startCell, {
        topHeight: 200,
        topResized: true,
      }),
    ).toBe(false)
  })

  it("ignores a content-height update on an unpinned editor", () => {
    // Given an auto-sized editor whose content grows
    // When Monaco reports a new content height without pinning
    // Then the agent still reads "auto" and is not staled
    expect(hasAgentVisibleCellHeightChanged(runCell, { topHeight: 140 })).toBe(
      false,
    )
  })
})

describe("paneHeightsFromGridRows", () => {
  const withResult = (over: Partial<NotebookCell> = {}): NotebookCell => ({
    id: "x",
    position: 0,
    value: "",
    result: { results: [], activeResultIndex: 0, timestamp: 0 },
    ...over,
  })

  it("returns an empty patch when rows already match the derived height", () => {
    // Given a single-view run cell whose content-derived height is 5 rows
    const runCell: NotebookCell = { id: "x", position: 0, value: "" }
    // When the requested rows equal that derived height (not a real resize)
    const patch = paneHeightsFromGridRows(runCell, 5, 10, 20)
    // Then nothing is pinned — auto-height is left intact
    expect(patch).toEqual({})
  })

  it("single-view: grows the editor and pins topResized", () => {
    // Given a single-view run cell (no bottom slot, base chrome 44)
    const runCell: NotebookCell = { id: "x", position: 0, value: "" }
    // When a taller height is requested (box 10*10+9*20 = 280,
    // targetContentPx = 280 - 44 = 236)
    const patch = paneHeightsFromGridRows(runCell, 10, 10, 20)
    // Then the editor grows to fill it and is pinned
    expect(patch).toEqual({ topHeight: 236, topResized: true })
  })

  it("split double-view: resizes the result pane and pins bottomResized", () => {
    // Given a double-view cell (has result) in split view — split chrome 50
    const c = withResult({ topHeight: 72, bottomHeight: 100 })
    // When a taller height is requested (box 15*10+14*20 = 430,
    // targetContentPx = 430 - 50 = 380)
    const patch = paneHeightsFromGridRows(c, 15, 10, 20)
    // Then only the bottom slot grows (editor kept), pinned via bottomResized
    expect(patch).toEqual({ bottomHeight: 308, bottomResized: true })
  })

  it("split double-view: never consumes editor height below the result floor", () => {
    // Given a split cell with a 400px editor and a 300px result
    const c = withResult({ topHeight: 400, bottomHeight: 300 })

    // When the cell is resized to the split minimum
    // The split minimum is 400px editor + 100px result + 50px chrome,
    // or 19 rows. Resizing to that floor changes only the result pane.
    const patch = paneHeightsFromGridRows(c, 19, 10, 20)

    // Then only the result pane shrinks
    expect(patch).toEqual({ bottomHeight: 100, bottomResized: true })
    expect(patch).not.toHaveProperty("topHeight")
    expect(patch).not.toHaveProperty("topResized")
  })

  it("editor-hidden double-view: resizes only the visible result pane", () => {
    // Given an editor-hidden double-view cell carrying base chrome only
    const c = withResult({
      topHeight: 72,
      bottomHeight: 100,
      paneView: "result",
    })
    // When a taller height is requested (targetContentPx = 430 - 44 = 386,
    // and no editor allocation in its visible footprint)
    const patch = paneHeightsFromGridRows(c, 15, 10, 20)
    // Then only the result changes; the remembered editor height is untouched
    expect(patch).toEqual({
      bottomHeight: 386,
      bottomResized: true,
    })
  })

  it("editor-only and result-only cells resize only their visible pane", () => {
    // Given a cell with both pane heights
    const c = withResult({ topHeight: 200, bottomHeight: 300 })

    // When each single-pane layout is resized
    // Then only the visible pane changes
    expect(
      paneHeightsFromGridRows({ ...c, result: undefined }, 10, 10, 20),
    ).toEqual({
      topHeight: 236,
      topResized: true,
    })
    expect(
      paneHeightsFromGridRows({ ...c, paneView: "result" }, 15, 10, 20),
    ).toEqual({
      bottomHeight: 386,
      bottomResized: true,
    })
  })

  it("expecting cell: resizes the reserved result pane, not the editor", () => {
    // Given a run-marked cell whose result is not in memory — it renders
    // split (editor + reserved shimmer), so a drag must size the bottom slot
    const expecting: NotebookCell = {
      id: "x",
      position: 0,
      value: "",
      topHeight: 72,
      bottomHeight: 100,
      lastRunStatus: "success",
    }
    // When a taller height is requested (targetContentPx = 430 - 50 = 380)
    const patch = paneHeightsFromGridRows(expecting, 15, 10, 20, true)
    // Then the reserved pane grows, exactly like a hydrated double-view drag
    expect(patch).toEqual({ bottomHeight: 308, bottomResized: true })
  })
})

describe("isExpectingResult", () => {
  const ranCell = {
    id: "x",
    position: 0,
    value: "select 1",
    lastRunStatus: "success" as const,
  }
  it("expects a result for a run-marked cell whose result is not in memory", () => {
    // Given a cell that ran before but holds no result — before its snapshot
    // is requested, and while it loads
    expect(isExpectingResult(ranCell, "unrequested")).toBe(true)
    expect(isExpectingResult(ranCell, "loading")).toBe(true)
  })
  it("stops expecting a result once the snapshot is known missing", () => {
    expect(isExpectingResult(ranCell, "missing")).toBe(false)
  })
  it("false when a result has already landed", () => {
    expect(
      isExpectingResult(
        {
          ...ranCell,
          result: { results: [], activeResultIndex: 0, timestamp: 0 },
        },
        "loaded",
      ),
    ).toBe(false)
  })
  it("false for a cell that never ran", () => {
    expect(
      isExpectingResult({ id: "x", position: 0, value: "" }, "unrequested"),
    ).toBe(false)
    expect(
      isExpectingResult({ ...ranCell, lastRunStatus: "none" }, "unrequested"),
    ).toBe(false)
  })
  it("false for draw cells (they size via the chart default)", () => {
    expect(isExpectingResult({ ...ranCell, mode: "draw" }, "unrequested")).toBe(
      false,
    )
  })
})

describe("releaseCellResultPatch", () => {
  const threeRowResult: CellResult = {
    results: [
      {
        type: "dql",
        query: "select 1",
        columns: [{ name: "x", type: "INT" }],
        dataset: [[1], [2], [3]],
        count: 3,
      },
    ],
    activeResultIndex: 0,
    timestamp: 0,
  }

  it("carries the collapsed run status and stamps the rendered bottom height", () => {
    // Given a first-run-this-session cell: result set, no lastRunStatus and no
    // stored bottom height yet
    const cell: NotebookCell = {
      id: "x",
      position: 0,
      value: "select 1",
      result: threeRowResult,
    }

    // When the result is released from memory
    const patch = releaseCellResultPatch(cell)

    // Then the run marker survives and the released cell keeps the exact
    // height its result rendered at, not the reserved fallback
    expect(patch).toEqual({
      result: undefined,
      lastRunStatus: "success",
      bottomHeight: computeResultBottomHeight(threeRowResult, "select 1"),
    })
  })

  it("preserves a stored bottom height instead of stamping", () => {
    // Given a cell whose bottom height is already recorded
    const cell: NotebookCell = {
      id: "x",
      position: 0,
      value: "select 1",
      bottomHeight: 300,
      result: threeRowResult,
    }

    // When the result is released
    const patch = releaseCellResultPatch(cell)

    // Then the patch leaves the stored height untouched
    expect(patch).toEqual({ result: undefined, lastRunStatus: "success" })
    expect("bottomHeight" in patch).toBe(false)
  })

  it("keeps the existing run marker when no result is in memory", () => {
    // Given a cell whose marker came from a prior strip
    const cell: NotebookCell = {
      id: "x",
      position: 0,
      value: "select 1",
      lastRunStatus: "error",
    }

    // When released again
    const patch = releaseCellResultPatch(cell)

    // Then the marker is unchanged and no height is stamped
    expect(patch).toEqual({ result: undefined, lastRunStatus: "error" })
  })

  it("never stamps a grid height on a draw cell", () => {
    // Given a draw cell holding the chart's frame and no stored height
    const cell: NotebookCell = {
      id: "x",
      position: 0,
      value: "select 1",
      mode: "draw",
      result: threeRowResult,
    }

    // When the result is released from memory
    const patch = releaseCellResultPatch(cell)

    // Then the chart keeps its own height — a grid-derived stamp would
    // shrink it on re-hydration
    expect("bottomHeight" in patch).toBe(false)
  })
})

// Every path that drops the result blob must carry the error string with the
// status, so the agent still reads WHY the last run failed after the rows are
// gone — and a fixed or rewritten cell must not resurrect a stale error.

describe("cellModeChangePatch", () => {
  it("never overrides a user-resized bottom slot", () => {
    // Given a cell whose bottom slot the user resized
    const resized = { ...cell("a"), bottomResized: true }
    // When the mode flips either way
    // Then no patch is produced
    expect(cellModeChangePatch(resized, "draw")).toEqual({})
    expect(cellModeChangePatch(resized, "run")).toEqual({})
  })

  it("draw mode → chart default height", () => {
    // When a cell flips to draw
    const patch = cellModeChangePatch(cell("a"), "draw")
    // Then the chart default bottom height is seeded
    expect(patch).toEqual({ bottomHeight: DEFAULT_CHART_BOTTOM_HEIGHT })
  })

  it("run mode with a result → height derived from the result", () => {
    // Given a cell holding an error result (notification-only → 44)
    const withResult = cell("a", "SELECT 1", {
      results: [{ type: "error", query: "X", error: "boom" }],
      activeResultIndex: 0,
      timestamp: 0,
    })
    // When the cell flips back to run
    const patch = cellModeChangePatch(withResult, "run")
    // Then the bottom slot matches the result's computed height
    expect(patch).toEqual({ bottomHeight: 44 })
  })

  it("run mode without a result → clears bottomHeight (single view)", () => {
    // When a result-less cell flips back to run
    const patch = cellModeChangePatch(cell("a"), "run")
    // Then bottomHeight is explicitly cleared
    expect(patch).toEqual({ bottomHeight: undefined })
  })
})

describe("patchCellRunResult", () => {
  const errorResult = {
    results: [{ type: "error" as const, query: "X", error: "boom" }],
    activeResultIndex: 0,
    timestamp: 0,
  }

  it("patches only the target cell and sizes its bottom slot", () => {
    // Given two cells
    const cells = [cell("a"), cell("b")]
    // When a run result lands on "a"
    const next = patchCellRunResult(cells, "a", errorResult)
    // Then "a" carries the result + derived bottomHeight and "b" is untouched
    expect(next[0].result).toBe(errorResult)
    expect(next[0].bottomHeight).toBe(44)
    expect(next[1]).toBe(cells[1])
  })

  it("keeps a user-resized bottom slot and skips draw/markdown sizing", () => {
    // Given a resized cell, a draw cell, and a markdown cell
    const resized = { ...cell("a"), bottomResized: true, bottomHeight: 500 }
    const draw = { ...cell("b"), mode: "draw" as const }
    const markdown = { ...cell("c"), type: "markdown" as const }
    // When results land on each
    const [a] = patchCellRunResult([resized], "a", errorResult)
    const [b] = patchCellRunResult([draw], "b", errorResult)
    const [c] = patchCellRunResult([markdown], "c", errorResult)
    // Then the result is stored but bottomHeight is never touched
    expect(a.result).toBe(errorResult)
    expect(a.bottomHeight).toBe(500)
    expect(b.bottomHeight).toBeUndefined()
    expect(c.bottomHeight).toBeUndefined()
  })
})

describe("agentCellDimensionsPatch", () => {
  const markdownCell = (patch: Partial<NotebookCell>): NotebookCell => ({
    id: "m1",
    position: 0,
    value: "# Title\n\nSome prose",
    type: "markdown",
    ...patch,
  })

  it("keeps a markdown cell's measured height when the agent asks for auto", () => {
    // Given an unpinned markdown cell whose observer measured its content
    const cell = markdownCell({ topHeight: 236, topResized: false })

    // When the agent sends editor_height "auto" again
    const patch = agentCellDimensionsPatch(cell, { editorHeight: "auto" })

    // Then only the pin clears and the measurement survives
    expect(patch).toEqual({ topResized: false })
  })

  it("clears a pinned markdown cell so it re-measures on the flip", () => {
    // Given a markdown cell pinned below its content height
    const cell = markdownCell({ topHeight: 500, topResized: true })

    // When the agent sends editor_height "auto"
    const patch = agentCellDimensionsPatch(cell, { editorHeight: "auto" })

    // Then the pin clears and the stale number is left for the observer
    expect(patch).toEqual({ topResized: false })
  })

  it("restores the SQL editor's content height on auto", () => {
    // Given a pinned SQL cell
    const cell: NotebookCell = {
      id: "s1",
      position: 0,
      value: "select 1",
      topHeight: 400,
      topResized: true,
    }

    // When the agent sends editor_height "auto"
    const patch = agentCellDimensionsPatch(cell, { editorHeight: "auto" })

    // Then the editor returns to its content height, unpinned
    expect(patch).toEqual({
      topHeight: topHeightForSql("select 1"),
      topResized: false,
    })
  })
})
