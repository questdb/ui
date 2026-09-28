import type {
  AgentCellView,
  CellMode,
  CellPaneView,
  CellResult,
  NotebookCell,
  SingleQueryResult,
} from "../../../store/notebook"
import { isAgentCellView, isCellPaneView } from "../../../store/notebook"
import type { ChartConfig } from "./CellChart/chartTypes"
import type { CellResultStatus } from "./resultHydration/cellResultHydration"
import { getQueriesFromText } from "../Monaco/utils"
import { slotResultsByText } from "./statementIdentity"
import {
  HEADER_HEIGHT,
  ROW_HEIGHT,
} from "../../../components/ResultGrid/dimensions"
import {
  carriedRunError,
  carriedRunStatus,
  runHistoryPatch,
} from "./runHistory"

// Cells are in one of three view states:
//
//   - Editor visible, no result: topHeight + chrome.
//   - Editor visible with result: topHeight + bottomHeight + split chrome.
//   - Editor hidden: bottomHeight + chrome. topHeight stays persisted but does
//     not consume space, so restoring the editor expands around both panes.
//
// `topHeight` and `bottomHeight` live on NotebookCell. In grid mode, grid h is
// derived from the currently visible pane heights on every render.

// Exact fixed chrome every cell carries, in pixels:
//   - Drag header: 42 px (HeaderBar's FIXED height — its right slot swaps
//     between the neutral Run/Draw toggles and the view toggle without
//     changing cell geometry)
//   - CellWrapper top + bottom border: 1 px each
export const CELL_BASE_CHROME_PX = 44

// The in-flow editor/result divider (the split ResizeHandle's $doubleView
// variant) — rendered only when the editor and a bottom slot are both visible.
const SPLIT_HANDLE_PX = 6

// Monaco's reported content height for an empty editor (one line + padding).
// The editor auto-grows with content up to the shared pane ceiling and scrolls
// inside past it.
export const MIN_EDITOR_HEIGHT = 72

// Default editor height for a newly-created cell, before any content arrives.
export const DEFAULT_TOP_HEIGHT = MIN_EDITOR_HEIGHT

export const CELL_EDITOR_LINE_HEIGHT = 24
export const CELL_EDITOR_PADDING = { top: 4, bottom: 4 }

export const topHeightForSql = (value: string): number =>
  clampPaneHeight(
    DEFAULT_TOP_HEIGHT,
    value.split("\n").length * CELL_EDITOR_LINE_HEIGHT +
      CELL_EDITOR_PADDING.top +
      CELL_EDITOR_PADDING.bottom,
  )

// Markdown cells carry the base chrome only (they never split) and keep their
// heights on the grid-row lattice (56, 86, 116, …) so the derived cell box is
// always exact — see snapMarkdownTopHeight.
// One line of rendered prose is 34px, so 56 is the first lattice point that
// shows any content. Stored heights below it render as they are until the next
// resize writes a new value.
export const MIN_MARKDOWN_HEIGHT_PX = 56

// Default chart height for draw mode (experimental — per user spec).
export const DEFAULT_CHART_BOTTOM_HEIGHT = 350

export const MIN_BOTTOM_HEIGHT_PX = 100
// ECharts reserves roughly 96-126 px for axes, labels, and the zoom control.
// A 100 px chart pane is structurally valid but leaves no useful plot. Keep
// table results at the historical minimum while giving charts a visual floor.
const MIN_CHART_HEIGHT_PX = 296
// One ceiling for every pane: it only stops nonsense such as multi-million
// pixel agent writes or an editor auto-grown to a hundred thousand lines.
export const MAX_PANE_HEIGHT_PX = 2400

export const clampPaneHeight = (minimum: number, px: number): number =>
  Math.min(MAX_PANE_HEIGHT_PX, Math.max(minimum, px))

export const minBottomHeightFor = (cell: NotebookCell): number =>
  cell.mode === "draw" ? MIN_CHART_HEIGHT_PX : MIN_BOTTOM_HEIGHT_PX

// Before pane views, a maximized cell showed its result pane at editor +
// result height. Runs once, when a read infers the pane view from the legacy
// flag: the hidden editor's height folds into the result pane so the
// cell keeps the size it had. The next persist drops the flag, and later
// reads pass the stored pane view through untouched. A chart with no stored
// result height folds its default; a grid's default depends on the result,
// which a read does not hold, so it keeps auto sizing.
export const foldLegacyMaximizedHeights = (
  cell: NotebookCell,
): NotebookCell => {
  const bottomHeight =
    cell.bottomHeight ??
    (cell.mode === "draw" ? DEFAULT_CHART_BOTTOM_HEIGHT : undefined)
  if (bottomHeight === undefined) return cell
  const topHeight = cell.topHeight ?? minTopHeightFor(cell)
  return {
    ...cell,
    bottomHeight: clampPaneHeight(
      minBottomHeightFor(cell),
      topHeight + bottomHeight,
    ),
    ...(cell.topResized ? { bottomResized: true } : {}),
  }
}

export type AgentHeightValue = number | "auto" | null

// Reads a cell's live snapshot-load status; the passive (unmounted) route has
// no live statuses and falls back to "unrequested", matching what the mounted
// notebook renders for a run-marked cell before its snapshot loads.
export type CellResultStatusReader = (cellId: string) => CellResultStatus

export type AgentCellDimensions = {
  editorHeight?: AgentHeightValue
  resultHeight?: AgentHeightValue
  view?: AgentCellView | null
  resultStatus?: CellResultStatus
}

const applicableCellDimensions = (
  cell: Pick<NotebookCell, "type">,
  dimensions: AgentCellDimensions,
): AgentCellDimensions =>
  cell.type === "markdown"
    ? { ...dimensions, resultHeight: null, view: null }
    : dimensions

type AgentCellDimensionsValidationIssue =
  | { reason: "invalid_view" }
  | {
      field: "editor_height" | "result_height"
      reason: "invalid_type"
    }
  | {
      field: "editor_height" | "result_height"
      reason: "below_minimum" | "above_maximum"
      value: number
      limit: number
    }

type AgentCellDimensionsValidation =
  | { ok: true; dimensions: AgentCellDimensions }
  | { ok: false; issue: AgentCellDimensionsValidationIssue }

// One validator for both set_cell_dimensions and apply_notebook_state. The
// callers keep their tool-specific error types/messages, while contextual
// minima and the shared ceiling cannot drift between the two entry points.
export const validateAgentCellDimensions = (
  cell: NotebookCell,
  requested: AgentCellDimensions,
): AgentCellDimensionsValidation => {
  if (requested.view != null && !isAgentCellView(requested.view)) {
    return { ok: false, issue: { reason: "invalid_view" } }
  }
  const dimensions = applicableCellDimensions(cell, requested)
  const values = [
    {
      field: "editor_height" as const,
      value: dimensions.editorHeight,
      minimum: minTopHeightFor(cell),
    },
    {
      field: "result_height" as const,
      value: dimensions.resultHeight,
      minimum: minBottomHeightFor(cell),
    },
  ]
  for (const { field, value, minimum } of values) {
    if (value === undefined || value === null || value === "auto") continue
    if (typeof value !== "number") {
      return { ok: false, issue: { field, reason: "invalid_type" } }
    }
    if (!Number.isFinite(value) || value < minimum) {
      return {
        ok: false,
        issue: {
          field,
          reason: "below_minimum",
          value,
          limit: minimum,
        },
      }
    }
    if (value > MAX_PANE_HEIGHT_PX) {
      return {
        ok: false,
        issue: {
          field,
          reason: "above_maximum",
          value,
          limit: MAX_PANE_HEIGHT_PX,
        },
      }
    }
  }
  return { ok: true, dimensions }
}

// The agent's view:"editor" is the toggle-off gesture, not a stored value:
// discard the run outcome, keeping the stored pane arrangement for the next
// result. Callers also delete the draw marker and persisted snapshot.
export const discardCellResult = (cell: NotebookCell): NotebookCell => {
  const next: NotebookCell = {
    ...cell,
    result: undefined,
    lastRunStatus: undefined,
    ...(cell.bottomResized ? {} : { bottomHeight: undefined }),
  }
  delete next.mode
  return next
}

// Translate the semantic agent wire model into the persisted pane model.
// `null`/omission preserves, "auto" clears the corresponding resize pin, and
// a number fixes the pane at that pixel height. view:"editor" is an action,
// not a stored value — callers apply discardCellResult for it.
// A markdown cell's unpinned topHeight is the content measurement its
// ResizeObserver keeps current, so "auto" only clears the pin: an unpinned
// cell keeps its measurement, and a pinned one re-measures on the flip.
export const agentCellDimensionsPatch = (
  cell: NotebookCell,
  dimensions: AgentCellDimensions,
): Partial<NotebookCell> => {
  const patch: Partial<NotebookCell> = {}
  if (dimensions.editorHeight === "auto") {
    if (cell.type !== "markdown") patch.topHeight = topHeightForSql(cell.value)
    patch.topResized = false
  } else if (typeof dimensions.editorHeight === "number") {
    patch.topHeight = dimensions.editorHeight
    patch.topResized = true
  }
  if (dimensions.resultHeight === "auto") {
    patch.bottomHeight = undefined
    patch.bottomResized = false
  } else if (typeof dimensions.resultHeight === "number") {
    patch.bottomHeight = dimensions.resultHeight
    patch.bottomResized = true
  }
  if (isCellPaneView(dimensions.view) && cell.type !== "markdown") {
    patch.paneView = dimensions.view
  }
  return patch
}

// Pixel sizes of the result panel's chrome. Kept in sync with the styled-
// components in result-table/styles.ts; if those constants change, update
// here.
const TAB_BAR_PX = 40 // TabBarWrapper height = 4rem
const NOTIFICATION_PX = 44 // StatusNotification (compact=true → 4rem + 1-2 px borders)
const RESULT_ACTIONS_BAR_PX = 36 // ResultActionsBar height = 3.6rem (shown with the grid)
export const MAX_RESERVED_ROWS = 10 // cap for "tight-fit" single-query results

// Height to reserve for a run cell's result area while its snapshot hydrates —
// the same max single-statement grid height `computeResultBottomHeight` settles
// to for a ≥10-row result, so the grid drops in without a height jump. Mirrors
// how draw reserves a fixed DEFAULT_CHART_BOTTOM_HEIGHT before its data lands.
export const RESERVED_RESULT_BOTTOM_HEIGHT =
  NOTIFICATION_PX +
  RESULT_ACTIONS_BAR_PX +
  HEADER_HEIGHT +
  MAX_RESERVED_ROWS * ROW_HEIGHT

// A run-marked cell reserves its result area whenever the result is not in
// memory — before its snapshot is requested, while it loads, and after a far
// scroll released it. It collapses only once its own snapshot load proved
// there is nothing to restore.
export const isExpectingResult = (
  cell: NotebookCell,
  resultStatus: CellResultStatus,
): boolean =>
  cell.mode !== "draw" &&
  cell.lastRunStatus != null &&
  cell.lastRunStatus !== "none" &&
  cell.result == null &&
  resultStatus !== "missing"

// Stamps the derived bottom height when none is stored, so the released cell
// keeps the exact geometry its result rendered at — the expecting-result path
// would otherwise fall back to RESERVED_RESULT_BOTTOM_HEIGHT and jitter on
// every release/re-hydrate cycle.
export const releaseCellResultPatch = (
  cell: NotebookCell,
): Pick<
  NotebookCell,
  "result" | "lastRunStatus" | "lastRunError" | "bottomHeight"
> => ({
  result: undefined,
  lastRunStatus: carriedRunStatus(cell),
  lastRunError: carriedRunError(cell),
  ...(cell.mode !== "draw" && cell.bottomHeight == null && cell.result != null
    ? {
        bottomHeight: computeResultBottomHeight(cell.result, cell.value),
      }
    : {}),
})

const isDqlWithColumns = (r: SingleQueryResult): boolean =>
  r.type === "dql" && r.columns.length > 0

const dqlRowCount = (r: SingleQueryResult): number =>
  r.type === "dql" ? r.dataset.length : 0

// Computes the bottom slot height for the same statement frame rendered by
// InlineResultTable. `value` is the cell's current SQL; a partial run can have
// one result while still rendering multiple statement tabs (the unexecuted
// statements appear as "Not run").
//
// Rules:
//   1. Single-statement, no grid (error / DDL / DML / notice): just the
//      notification bar — no wasted blank space.
//   2. Single-statement DQL with columns: notification + actions bar + grid
//      header + min(N, 10) rows. A 0-row DQL still shows its column headers, so
//      it reserves the header with no row space. Shrinks for small results,
//      caps at 10 for large ones.
//   3. Multiple rendered statement slots add the tab bar, including when all
//      but one slot are "Not run".
//   4. Multiple executed results reserve a full 10 rows whenever any result
//      has a DQL grid (avoids clipping and jitter when switching result tabs).
//      A single executed result still tight-fits its own row count.
export const computeResultBottomHeight = (
  result: CellResult | null | undefined,
  value: string,
): number => {
  if (!result || result.results.length === 0) return NOTIFICATION_PX
  // Sizing claims slots by text only. The tab bar also claims by key, but it
  // has the engine's keys for free; here the formatter would run on every
  // keystroke. A frame under other text (an edit the engine has not adopted
  // yet, a selection run) sizes by its own results.
  const claimedSlots = slotResultsByText(
    getQueriesFromText(value),
    result.results,
  )
  const slotResults = claimedSlots?.some((slot) => slot !== null)
    ? claimedSlots
    : result.results
  const hasMultipleTabs = slotResults.length > 1
  const hasMultipleResults = result.results.length > 1
  const tabBar = hasMultipleTabs ? TAB_BAR_PX : 0

  if (hasMultipleResults) {
    const hasGrid = slotResults.some(
      (slot) => slot !== null && isDqlWithColumns(slot),
    )
    if (!hasGrid) {
      return tabBar + NOTIFICATION_PX
    }
    return (
      tabBar +
      NOTIFICATION_PX +
      RESULT_ACTIONS_BAR_PX +
      HEADER_HEIGHT +
      MAX_RESERVED_ROWS * ROW_HEIGHT
    )
  }

  // Single executed result: tight-fit up to 10 rows. The tab bar is still
  // included when the editor contributes additional "Not run" slots.
  const only = result.results[0]
  if (!isDqlWithColumns(only)) {
    return tabBar + NOTIFICATION_PX
  }
  const rows = Math.min(MAX_RESERVED_ROWS, dqlRowCount(only))
  return (
    tabBar +
    NOTIFICATION_PX +
    RESULT_ACTIONS_BAR_PX +
    HEADER_HEIGHT +
    rows * ROW_HEIGHT
  )
}

// Returns the appropriate default bottom-slot height for a cell, based on
// what the bottom slot will contain. Used as the render-time fallback when
// cell.bottomHeight is undefined (first paint of a freshly-loaded cell).
// Always agrees with what runCell would have written into cell.bottomHeight.
const defaultBottomHeightFor = (cell: NotebookCell): number =>
  cell.mode === "draw"
    ? DEFAULT_CHART_BOTTOM_HEIGHT
    : computeResultBottomHeight(cell.result, cell.value)

// True iff this cell has a result slot. Visibility determines whether the
// editor allocation is added alongside that slot.
export const isDoubleView = (cell: NotebookCell): boolean => {
  if (cell.mode === "draw") return true
  return cell.result != null
}

export type CellPaneLayout = "editor" | "split" | "result"

const storedCellPaneView = (cell: NotebookCell): CellPaneView =>
  isCellPaneView(cell.paneView) ? cell.paneView : "editor_result"

// A run outcome is anything view:"editor" would discard: an in-memory result,
// a carried run status (result on disk only), or draw mode itself.
export const cellHasRunOutcome = (cell: NotebookCell): boolean =>
  cell.mode === "draw" ||
  cell.result != null ||
  (cell.lastRunStatus != null && cell.lastRunStatus !== "none")

export type AgentCellPresentation = {
  view: AgentCellView | null
  mode: CellMode | null
}

// `view` reports what the cell presents: "editor" while there is nothing to
// show, the stored arrangement once a run outcome exists. A live, known-missing
// run snapshot has historical status but no result pane; draw mode remains a
// result presentation because the chart itself is the mode.
export const agentCellPresentation = (
  cell: NotebookCell,
  resultStatus: CellResultStatus = "unrequested",
): AgentCellPresentation => {
  const view: AgentCellView | null =
    cell.type === "markdown"
      ? null
      : cellHasRunOutcome(cell) &&
          !(
            cell.mode !== "draw" &&
            cell.result == null &&
            resultStatus === "missing"
          )
        ? storedCellPaneView(cell)
        : "editor"

  return {
    view,
    mode:
      view === null || view === "editor"
        ? null
        : cell.mode === "draw"
          ? "draw"
          : "run",
  }
}

export const hasExplicitModeForEditor = (
  mode: CellMode | null | undefined,
  view: AgentCellView | null | undefined,
): boolean => view === "editor" && mode != null

// A cell without a result shows the editor until one exists; that never
// rewrites its stored view.
export const resolveCellPaneLayout = (
  cell: NotebookCell,
  expectingResult: boolean = false,
): CellPaneLayout => {
  if (!isDoubleView(cell) && !expectingResult) return "editor"
  return storedCellPaneView(cell) === "result" ? "result" : "split"
}

// bottomHeight seeding when a cell flips between run and draw. A user-resized
// bottom slot is never overridden.
export const cellModeChangePatch = (
  cell: NotebookCell,
  mode: CellMode,
): Partial<NotebookCell> => {
  if (cell.bottomResized) return {}
  return {
    bottomHeight:
      mode === "draw"
        ? DEFAULT_CHART_BOTTOM_HEIGHT
        : cell.result
          ? computeResultBottomHeight(cell.result, cell.value)
          : undefined,
  }
}

export const mergeCellChartConfig = (
  cell: NotebookCell,
  patch: Partial<ChartConfig>,
): ChartConfig => {
  const base: ChartConfig = cell.chartConfig ?? { xColumn: null, queries: [] }
  return { ...base, ...patch }
}

export const patchCellRunResult = (
  cells: NotebookCell[],
  cellId: string,
  result: CellResult,
): NotebookCell[] =>
  cells.map((cell) => {
    if (cell.id !== cellId) return cell
    const next: NotebookCell = { ...cell, result, ...runHistoryPatch(result) }
    if (
      !cell.bottomResized &&
      cell.mode !== "draw" &&
      cell.type !== "markdown"
    ) {
      next.bottomHeight = computeResultBottomHeight(result, cell.value)
    }
    return next
  })

// Exact per-state chrome. Split cells (editor above, result/chart or its
// reserved shimmer below) add the in-flow divider; an editor-hidden cell
// carries base chrome only.
const cellChromePx = (
  cell: NotebookCell,
  paneLayout: CellPaneLayout,
): number => {
  if (cell.type === "markdown") return CELL_BASE_CHROME_PX
  return paneLayout === "split"
    ? CELL_BASE_CHROME_PX + SPLIT_HANDLE_PX
    : CELL_BASE_CHROME_PX
}

export const minTopHeightFor = (cell: NotebookCell): number =>
  cell.type === "markdown" ? MIN_MARKDOWN_HEIGHT_PX : DEFAULT_TOP_HEIGHT

export const agentCellPaneDimensions = (
  cell: NotebookCell,
): {
  editorHeight: number | "auto"
  resultHeight: number | "auto" | null
} => {
  const pinnedHeight = (
    resized: boolean | undefined,
    height: number | undefined,
    minimum: number,
  ): number | "auto" =>
    resized && typeof height === "number" && Number.isFinite(height)
      ? clampPaneHeight(minimum, height)
      : "auto"

  return {
    editorHeight: pinnedHeight(
      cell.topResized,
      cell.topHeight,
      minTopHeightFor(cell),
    ),
    resultHeight:
      cell.type === "markdown"
        ? null
        : pinnedHeight(
            cell.bottomResized,
            cell.bottomHeight,
            minBottomHeightFor(cell),
          ),
  }
}

// Resolves a cell's editor (top) and bottom-slot heights — shared by the
// rendered cell (Cell.tsx, with live drag overrides) and computeCellGridH.
export const computeCellHeights = (
  cell: NotebookCell,
  opts: {
    liveTopHeight?: number | null
    liveBottomHeight?: number | null
    expectingResult?: boolean
  } = {},
): { topHeight: number; bottomHeight: number } => {
  const topHeight =
    opts.liveTopHeight ?? cell.topHeight ?? minTopHeightFor(cell)
  const resolvedBottomHeight = isDoubleView(cell)
    ? (opts.liveBottomHeight ??
      cell.bottomHeight ??
      defaultBottomHeightFor(cell))
    : opts.expectingResult === true
      ? (opts.liveBottomHeight ??
        cell.bottomHeight ??
        RESERVED_RESULT_BOTTOM_HEIGHT)
      : 0
  // A visible bottom slot never renders below its pane floor (296 chart /
  // 100 result): a bare notification sits in a 100px pane rather than a
  // 44px sliver, so the rendered height, the resize bounds, and the save
  // path all share one minimum.
  const bottomHeight =
    resolvedBottomHeight === 0
      ? 0
      : Math.max(minBottomHeightFor(cell), resolvedBottomHeight)
  return { topHeight, bottomHeight }
}

// Grid geometry — shared by the renderer, the layout builder, and the agent
// snapshot so their `h` derivations agree.
export const NOTEBOOK_GRID_COLS = 12
export const NOTEBOOK_GRID_ROW_HEIGHT = 10
export const NOTEBOOK_GRID_MARGIN_Y = 20

export const cellGridBoundsError = (pos: {
  x: number
  w: number
}): string | undefined =>
  pos.x + pos.w > NOTEBOOK_GRID_COLS
    ? `x + w must be at most ${NOTEBOOK_GRID_COLS}.`
    : undefined

type CellGridBounds = { h: number; minH: number; maxH: number }

// Derives react-grid-layout `h` and its resize bounds from the visible pane
// heights plus chrome — one computation, so the three numbers can never
// disagree and `minH ≤ h ≤ maxH` holds for every in-bounds cell state.
// Recomputed at render time on every state change.
//
// react-grid-layout inserts `marginY` BETWEEN rows, so the actual
// rendered px of an h-row cell is `h * rowHeight + (h - 1) * marginY`,
// NOT `h * rowHeight`. To fit a content of `totalPx` we therefore need
// `ceil((totalPx + marginY) / (rowHeight + marginY))` rows. Forgetting
// the marginY term inflated cell heights by ~3× at rowHeight=10,
// marginY=20 (a 500-px content asked for 50 rows that rendered as
// ~1480 px). Default marginY=0 keeps backwards-compat for tests/callers
// that ignore margins.
//
// In a split cell the south edge owns only the result pane, so the bounds
// reserve the editor's current allocation rather than merely its minimum.
// The split handle owns only the editor pane and grows the cell with it.
// Legacy heights stored outside the pane floors/ceiling deliberately render
// as-is; their first drag snaps them into the new bounds.
export const computeCellGridBounds = (
  cell: NotebookCell,
  rowHeight: number,
  marginY: number = 0,
  expectingResult: boolean = false,
): CellGridBounds => {
  const paneLayout = resolveCellPaneLayout(cell, expectingResult)
  const { topHeight, bottomHeight } = computeCellHeights(cell, {
    expectingResult,
  })
  const chrome = cellChromePx(cell, paneLayout)
  const rows = (px: number): number =>
    Math.max(1, Math.ceil((px + marginY) / (rowHeight + marginY)))
  const visibleTopHeight = paneLayout === "result" ? 0 : topHeight
  const visibleBottomHeight = paneLayout === "editor" ? 0 : bottomHeight
  const minTopPx =
    paneLayout === "result"
      ? 0
      : paneLayout === "editor"
        ? minTopHeightFor(cell)
        : Math.max(minTopHeightFor(cell), topHeight)
  const maxTopPx =
    paneLayout === "result"
      ? 0
      : paneLayout === "split"
        ? topHeight
        : MAX_PANE_HEIGHT_PX
  const minBottomPx = paneLayout === "editor" ? 0 : minBottomHeightFor(cell)
  const maxBottomPx = paneLayout === "editor" ? 0 : MAX_PANE_HEIGHT_PX
  return {
    h: rows(chrome + visibleTopHeight + visibleBottomHeight),
    minH: rows(chrome + minTopPx + minBottomPx),
    maxH: rows(chrome + maxTopPx + maxBottomPx),
  }
}

export const computeCellGridH = (
  cell: NotebookCell,
  rowHeight: number,
  marginY: number = 0,
  expectingResult: boolean = false,
): number => computeCellGridBounds(cell, rowHeight, marginY, expectingResult).h

export const snapMarkdownTopHeight = (px: number): number => {
  const step = NOTEBOOK_GRID_ROW_HEIGHT + NOTEBOOK_GRID_MARGIN_Y
  const totalPx = Math.max(px, MIN_MARKDOWN_HEIGHT_PX) + CELL_BASE_CHROME_PX
  const rows = Math.ceil((totalPx + NOTEBOOK_GRID_MARGIN_Y) / step)
  return Math.min(
    MAX_PANE_HEIGHT_PX,
    rows * step - NOTEBOOK_GRID_MARGIN_Y - CELL_BASE_CHROME_PX,
  )
}

// Hydration status isn't knowable headlessly; "unrequested" (reserved space)
// matches what the notebook renders for a run-marked cell before its snapshot
// loads, so agent-visible heights agree with the screen.
export const computeAgentCellGridH = (
  cell: NotebookCell,
  expectingResult: boolean = isExpectingResult(cell, "unrequested"),
): number =>
  computeCellGridH(
    cell,
    NOTEBOOK_GRID_ROW_HEIGHT,
    NOTEBOOK_GRID_MARGIN_Y,
    expectingResult,
  )

// The agent reads pinned pane heights in both layouts (grid rows are derived
// from them), so a resize is agent-visible when either height it would read
// changes between the two cells.
export const hasAgentVisibleCellHeightChanged = (
  cell: NotebookCell,
  patch: Partial<NotebookCell>,
): boolean => {
  const before = agentCellPaneDimensions(cell)
  const after = agentCellPaneDimensions({ ...cell, ...patch })
  return (
    before.editorHeight !== after.editorHeight ||
    before.resultHeight !== after.resultHeight
  )
}

// A pane drag is local state until drop. Only a grid box that needs another
// row makes the store follow mid-drag; a store write renders the whole
// notebook, so it is never paid per pointer move.
export const gridBoxRowsChange = (
  cell: NotebookCell,
  patch: Partial<NotebookCell>,
  layoutMode: "list" | "grid",
  expectingResult: boolean,
): boolean => {
  if (layoutMode !== "grid") return false
  const rowsOf = (candidate: NotebookCell) =>
    computeCellGridH(
      candidate,
      NOTEBOOK_GRID_ROW_HEIGHT,
      NOTEBOOK_GRID_MARGIN_Y,
      expectingResult,
    )
  return rowsOf(cell) !== rowsOf({ ...cell, ...patch })
}

export const partitionCellHeights = (
  sum: number,
  requestedTop: number,
  minTop: number,
  minBottom: number,
): { top: number; bottom: number } => {
  let top = Math.max(minTop, requestedTop)
  let bottom = sum - top
  if (bottom < minBottom) {
    bottom = minBottom
    top = sum - bottom
  }
  return { top, bottom }
}

// Back-solves a grid `h` into the top/bottom height patch that makes
// computeCellGridH reproduce it, pinned via *Resized like a manual drag. Empty
// patch when the rows already match the derived height — an echo of the required
// grid.h is not a resize, so auto-height stays intact.
export const paneHeightsFromGridRows = (
  cell: NotebookCell,
  rows: number,
  rowHeight: number,
  marginY: number,
  expectingResult: boolean = false,
): Partial<NotebookCell> => {
  if (rows === computeCellGridH(cell, rowHeight, marginY, expectingResult)) {
    return {}
  }
  const paneLayout = resolveCellPaneLayout(cell, expectingResult)
  const targetContentPx =
    rows * rowHeight + (rows - 1) * marginY - cellChromePx(cell, paneLayout)
  if (paneLayout === "editor") {
    return {
      topHeight: clampPaneHeight(minTopHeightFor(cell), targetContentPx),
      topResized: true,
    }
  }
  if (paneLayout === "result") {
    return {
      bottomHeight: clampPaneHeight(minBottomHeightFor(cell), targetContentPx),
      bottomResized: true,
    }
  }
  const { topHeight } = computeCellHeights(cell, { expectingResult })
  const nextBottom = clampPaneHeight(
    minBottomHeightFor(cell),
    targetContentPx - topHeight,
  )
  return {
    bottomHeight: nextBottom,
    bottomResized: true,
  }
}
