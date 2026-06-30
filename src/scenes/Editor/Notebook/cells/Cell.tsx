import React, { useCallback, useEffect, useRef, useState } from "react"
import styled, { css, useTheme } from "styled-components"
import { color } from "../../../../utils"
import { Editor } from "@monaco-editor/react"
import {
  QuestDBLanguageName,
  getQueryFromCursor,
  normalizeQueryText,
  stripSQLComments,
} from "../../Monaco/utils"
import { CircleNotchSpinner } from "../../Monaco/icons"
import { QuestContext } from "../../../../providers/QuestProvider"
import { useNotebookActions } from "../NotebookProvider"
import { CellDragHeader } from "./CellDragHeader"
import { CellRunDrawToggles } from "./CellRunDrawToggles"
import { CellWideActions } from "./CellWideActions"
import { CellViewToggle } from "./CellViewToggle"
import { CellNameLabel } from "./CellNameLabel"
import { useChartLoading } from "./useChartLoading"
import { useChartZoomed } from "./useChartZoomed"
import { useCellToolbarTier } from "./useCellToolbarTier"
import { useCellWrapperInteractions } from "./useCellWrapperInteractions"
import { InlineResultTable } from "../result-table"
import { ResizeHandle } from "../resize"
import { CellWrapper } from "./CellWrapper"
import { DrawCanvas } from "../DrawCanvas"
import type { ChartConfig } from "../CellChart/chartTypes"
import type { NotebookCell } from "../../../../store/notebook"
import { exceedsCellLineLimit } from "../../../../store/notebook"
import { useCellResize } from "./useCellResize"
import { useCellSelectionDecoration } from "./useCellSelectionDecoration"
import { useMonacoCellEditor } from "./useMonacoCellEditor"
import { useCellReveal } from "./useCellReveal"
import { useEditor } from "../../../../providers/EditorProvider"
import {
  emitUserAction,
  signalUserEdit,
} from "../../../../utils/notebookAIBridge"
import { createRunStatus, type RanStatus } from "../../../../utils/ai/runStatus"
import { requireAllDQL } from "../../../../utils/tools/permissions"
import { toast } from "../../../../components/Toast"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import {
  computeCellHeights,
  isDoubleView,
  isExpectingResult,
  MIN_BOTTOM_HEIGHT_PX,
  partitionCellHeights,
  resolveCellView,
  resolveRunAction,
  scaleCellHeights,
} from "../notebookUtils"
import { useValidateWithGlobals } from "../globals/useValidateWithGlobals"

// Minimum content area heights. `MIN_EDITOR_HEIGHT` matches Monaco's reported
// content height for an empty editor (one line + padding); the previous
// `MAX_EDITOR_HEIGHT` cap is gone — the editor now auto-grows freely with
// pasted content (user-confirmed: unbounded).
const MIN_EDITOR_HEIGHT = 72

const EditorContainer = styled.div<{ $spotlight: boolean }>`
  overflow: hidden;
  background: ${color("editorBackground")};

  .cursorQueryDecoration {
    width: 0.2rem !important;
    background: ${color("green")};
    margin-left: 0.5rem;
  }

  .notebookSearchHighlight {
    background-color: rgba(255, 184, 108, 0.5);
    border-radius: 2px;
  }

  ${({ $spotlight }) =>
    $spotlight
      ? css`
          min-height: 0;
        `
      : css`
          min-height: ${MIN_EDITOR_HEIGHT}px;
          flex-shrink: 0;
        `}
`

const BottomSlot = styled.div<{ $spotlight: boolean }>`
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  ${({ $spotlight }) =>
    $spotlight
      ? null
      : css`
          flex-shrink: 0;
        `}
`

// Wraps the (overflow-clipped) cell card in list mode so the bottom-edge resize
// handle can straddle the cell border with its chip showing outside the card.
const CellShell = styled.div`
  position: relative;
`

const HydrationLoader = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  color: ${({ theme }) => theme.color.gray2};
`

type Props = {
  cell: NotebookCell
  index: number
  totalCells: number
  layoutMode?: "list" | "grid"
  isFocused: boolean
  isMaximized: boolean
  isRunning: boolean
  isHydrating: boolean
}

const CellInner: React.FC<Props> = ({
  cell,
  index,
  totalCells,
  layoutMode = "list",
  isFocused,
  isMaximized,
  isRunning,
  isHydrating,
}) => {
  const {
    runCell,
    reRunResultAt,
    cancelCell,
    cancelQuery,
    setActiveResultIndex,
    setCellMode,
    clearCellResult,
    setCellChartConfig,
    setCellViewMaximized,
    updateCell,
    setFocusedCell,
    getCellsSnapshot,
  } = useNotebookActions()
  const theme = useTheme()
  const { quest } = React.useContext(QuestContext)
  const { activeBuffer } = useEditor()
  const bufferIdForEvents =
    typeof activeBuffer.id === "number" ? activeBuffer.id : undefined
  const isDrawMode = cell.mode === "draw"

  const { wrapperRef, wrapperHandlers } = useCellWrapperInteractions({
    cellId: cell.id,
    layoutMode,
    isMaximized,
    isFocused,
  })
  const editorContainerRef = useRef<HTMLDivElement | null>(null)
  const resultRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLDivElement | null>(null)
  // A run from the Run toggle spins the Run segment; a run from the refresh
  // button spins the refresh button instead.
  const firstRunRef = useRef(false)

  const toolbarTier = useCellToolbarTier(headerRef, isMaximized)
  const { loading: chartLoading, refreshing: chartRefreshing } =
    useChartLoading(cell.id)
  const chartZoomed = useChartZoomed(cell.id)

  const contentHeightGetterRef = useRef<() => number | null>(() => null)

  const validateWithGlobals = useValidateWithGlobals()

  const topResize = useCellResize(
    MIN_EDITOR_HEIGHT,
    useCallback(
      (height: number) =>
        updateCell(cell.id, { topHeight: height, topResized: true }),
      [cell.id, updateCell],
    ),
    // Write Monaco's CURRENT content height directly on reset, rather
    // than setting `topHeight: undefined` and waiting for the next
    // `onContentHeightChange` to fill it in. The wait creates a
    // one-frame flicker where `topHeight` falls back to
    // DEFAULT_TOP_HEIGHT (72 px) and the bottom slot jumps up.
    useCallback(() => {
      const contentH = contentHeightGetterRef.current()
      const next =
        contentH != null
          ? Math.max(MIN_EDITOR_HEIGHT, contentH)
          : MIN_EDITOR_HEIGHT
      updateCell(cell.id, { topHeight: next, topResized: false })
    }, [cell.id, updateCell]),
  )
  const bottomResize = useCellResize(
    MIN_BOTTOM_HEIGHT_PX,
    useCallback(
      (height: number) =>
        updateCell(cell.id, { bottomHeight: height, bottomResized: true }),
      [cell.id, updateCell],
    ),
    useCallback(
      () =>
        updateCell(cell.id, { bottomHeight: undefined, bottomResized: false }),
      [cell.id, updateCell],
    ),
  )

  const handleChartConfigChange = useCallback(
    (config: ChartConfig) => {
      signalUserEdit()
      setCellChartConfig(cell.id, config)
    },
    [cell.id, setCellChartConfig],
  )

  const validatingDrawRef = useRef(false)

  // Returns true only when the cell actually entered draw mode, so a caller can
  // apply chart-only follow-ups (e.g. maximize) without affecting a cell whose
  // draw was refused by validation.
  const handleDrawClick = useCallback(async (): Promise<boolean> => {
    if (isDrawMode) {
      setCellMode(cell.id, "run")
      clearCellResult(cell.id)
      if (bufferIdForEvents !== undefined) {
        emitUserAction({
          kind: "user_changed_cell_mode",
          bufferId: bufferIdForEvents,
          cellId: cell.id,
          mode: "run",
        })
      }
      return false
    }
    if (validatingDrawRef.current) return false
    validatingDrawRef.current = true
    try {
      const decision = await requireAllDQL(cell.value, (s) =>
        validateWithGlobals(s),
      )
      if (!decision.granted) {
        toast.error(decision.reason)
        return false
      }
      setCellMode(cell.id, "draw")
      if (bufferIdForEvents !== undefined) {
        emitUserAction({
          kind: "user_changed_cell_mode",
          bufferId: bufferIdForEvents,
          cellId: cell.id,
          mode: "draw",
        })
      }
      return true
    } finally {
      validatingDrawRef.current = false
    }
  }, [
    cell.id,
    cell.value,
    isDrawMode,
    setCellMode,
    clearCellResult,
    bufferIdForEvents,
    validateWithGlobals,
  ])

  const liveTopHeight = topResize.liveHeight
  const liveBottomHeight = bottomResize.liveHeight

  // A run cell that had a persisted result (lastRunStatus is set, known
  // synchronously from the view state) reserves its result area from the FIRST
  // render while the snapshot hydrates; computeCellGridH reserves the same space
  // in the grid item's height (both go through computeCellHeights).
  const expectingResult = isExpectingResult(cell, isHydrating)
  const { topHeight, bottomHeight } = computeCellHeights(cell, {
    liveTopHeight,
    liveBottomHeight,
    expectingResult,
  })
  const doubleView = isDoubleView(cell) || expectingResult
  // Compact can't split — one full-height pane: the result fills the cell by
  // default, "View SQL" (isViewMaximized === false) shows the editor instead.
  const isCompactTier = toolbarTier === "compact"
  const isViewMaximized = isCompactTier
    ? doubleView && cell.isViewMaximized !== false
    : doubleView && !!cell.isViewMaximized
  const showBottomSlot = isViewMaximized || (doubleView && !isCompactTier)
  const isSplit = doubleView && !isViewMaximized && !isCompactTier
  const runActive = !isDrawMode && doubleView
  const view = resolveCellView(cell)
  const canRun = !!stripSQLComments(cell.value).trim()
  const isGridLoading = isRunning && firstRunRef.current

  const [spotlightLiveRatio, setSpotlightLiveRatio] = useState<number | null>(
    null,
  )
  const spotlightEditorRatio =
    spotlightLiveRatio ??
    cell.spotlightEditorRatio ??
    topHeight / (topHeight + bottomHeight)

  // Editor height pipeline (hard-cap model):
  //   - When NOT user-resized: cell.topHeight tracks Monaco's content height
  //     exactly. Editor auto-grows / auto-shrinks with content.
  //   - When user-resized (topResized === true): cell.topHeight is FIXED at
  //     the user's drag value. Monaco's content-size events are ignored;
  //     content overflow is handled by Monaco's internal scrollbar.
  // Per user spec: configured top-height should not expand to fit content —
  // the user's resize is a hard cap, scrolling stays inside Monaco.
  const handleContentHeightChange = useCallback(
    (px: number) => {
      if (isMaximized) return
      if (cell.topResized) return
      const next = Math.max(MIN_EDITOR_HEIGHT, px)
      if (next === cell.topHeight) return
      updateCell(cell.id, { topHeight: next })
    },
    [isMaximized, cell.id, cell.topResized, cell.topHeight, updateCell],
  )

  const { editorRef, monacoRef, handleEditorMount } = useMonacoCellEditor({
    cellId: cell.id,
    editorViewState: cell.editorViewState,
    quest,
    onFocus: useCallback(
      () => setFocusedCell(cell.id),
      [cell.id, setFocusedCell],
    ),
    onSaveViewState: useCallback(
      (state) => updateCell(cell.id, { editorViewState: state }),
      [cell.id, updateCell],
    ),
    onRunAtCursor: () => runSingle(),
    onRunAll: () => runAll(),
    onContentHeightChange: handleContentHeightChange,
    validate: validateWithGlobals,
  })

  const { applyHighlight, clearHighlight } = useCellSelectionDecoration(
    editorRef,
    monacoRef,
  )

  const { applyReveal } = useCellReveal(
    editorRef,
    monacoRef,
    cell.id,
    activeBuffer.id,
  )

  const handleRevealMount = useCallback<typeof handleEditorMount>(
    (ed, monaco) => {
      handleEditorMount(ed, monaco)
      applyReveal()
    },
    [handleEditorMount, applyReveal],
  )

  // Install the content-height getter that `topResize.resetHeight`
  // reads (declared above, before `editorRef` is in scope). The
  // closure over the stable `editorRef` means we don't need to
  // re-install when `editorRef.current` later transitions from null
  // to the mounted instance.
  useEffect(() => {
    contentHeightGetterRef.current = () =>
      editorRef.current?.getContentHeight() ?? null
  }, [editorRef])

  const tryRunSelection = useCallback(async (): Promise<boolean> => {
    const ed = editorRef.current
    if (!ed) return false
    const selection = ed.getSelection()
    const model = ed.getModel()
    if (!selection || !model || selection.isEmpty()) return false

    const selectedText = model.getValueInRange(selection)
    const normalized = normalizeQueryText(selectedText)
    if (!normalized) return false

    clearHighlight()
    const success = await runCell(cell.id, normalized)
    applyHighlight(success)
    return true
  }, [cell.id, runCell, editorRef, applyHighlight, clearHighlight])

  const emitRanEvent = useCallback(
    (status: RanStatus) => {
      if (bufferIdForEvents === undefined) return
      emitUserAction({
        kind: "user_ran_cell",
        bufferId: bufferIdForEvents,
        cellId: cell.id,
        status,
      })
    },
    [bufferIdForEvents, cell.id],
  )

  const handleRunAll = useCallback(
    async (ignoreSelection = false) => {
      if (editorRef.current) {
        if (!ignoreSelection && (await tryRunSelection())) return
        clearHighlight()
      }

      const priorResult =
        getCellsSnapshot().find((c) => c.id === cell.id)?.result ?? null
      const ok = await runCell(cell.id)
      const freshResult =
        getCellsSnapshot().find((c) => c.id === cell.id)?.result ?? null
      emitRanEvent(createRunStatus(priorResult, freshResult, ok))
    },
    [
      cell.id,
      runCell,
      tryRunSelection,
      editorRef,
      clearHighlight,
      emitRanEvent,
      getCellsSnapshot,
    ],
  )

  const handleRunSingle = useCallback(async () => {
    const ed = editorRef.current
    // Capture the cursor's statement before any await — a reveal in this same
    // gesture can unmount the editor, and reading it afterwards loses it.
    const cursorQuery = ed ? getQueryFromCursor(ed)?.query : undefined
    if (ed && (await tryRunSelection())) return
    // Cursor first; otherwise reuse the active result tab's query so a single
    // run never silently expands into running every statement.
    const activeQuery =
      cell.result?.results[cell.result.activeResultIndex]?.query
    const sql = cursorQuery ?? activeQuery
    if (!sql?.trim()) {
      await handleRunAll()
      return
    }
    clearHighlight()
    const priorResult =
      getCellsSnapshot().find((c) => c.id === cell.id)?.result ?? null
    const ok = await runCell(cell.id, normalizeQueryText(sql))
    const freshResult =
      getCellsSnapshot().find((c) => c.id === cell.id)?.result ?? null
    emitRanEvent(createRunStatus(priorResult, freshResult, ok))
  }, [
    cell.id,
    cell.result,
    runCell,
    tryRunSelection,
    editorRef,
    clearHighlight,
    handleRunAll,
    emitRanEvent,
    getCellsSnapshot,
  ])

  const runResolved = useCallback(
    (intent: "all" | "single", ignoreSelection = false) => {
      const plan = resolveRunAction(
        { mode: cell.mode, result: cell.result },
        { isCompactTier, showBottomSlot, intent },
      )
      if (plan.kind === "noop") return
      if (plan.kind === "chart") {
        firstRunRef.current = false
        eventBus.publish(EventType.NOTEBOOK_CELL_REFRESH_CHART, {
          cellId: cell.id,
        })
        return
      }
      if (plan.exitDraw) {
        signalUserEdit()
        setCellMode(cell.id, "run")
      }
      firstRunRef.current = cell.result == null
      // Start the run before revealing: under React 17 a reveal fired from a
      // native key event re-renders synchronously and unmounts the editor, so
      // the run must read the cursor first.
      if (plan.kind === "run-all") void handleRunAll(ignoreSelection)
      else void handleRunSingle()
      if (plan.reveal) setCellViewMaximized(cell.id, true)
    },
    [
      cell.id,
      cell.mode,
      cell.result,
      isCompactTier,
      showBottomSlot,
      setCellViewMaximized,
      setCellMode,
      handleRunAll,
      handleRunSingle,
    ],
  )
  const runAll = useCallback(() => runResolved("all"), [runResolved])
  const runSingle = useCallback(() => runResolved("single"), [runResolved])
  // Refresh re-runs the whole cell to reproduce its grid — never a stray
  // editor selection.
  const refreshRun = useCallback(() => runResolved("all", true), [runResolved])

  const isExternalSyncRef = useRef(false)

  // 500 ms-debounced — one event per cell per typing burst keeps the digest tiny.
  const updateEmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleUpdateEvent = useCallback(() => {
    if (bufferIdForEvents === undefined) return
    if (updateEmitTimerRef.current !== null) {
      clearTimeout(updateEmitTimerRef.current)
    }
    updateEmitTimerRef.current = setTimeout(() => {
      updateEmitTimerRef.current = null
      emitUserAction({
        kind: "user_updated_cell",
        bufferId: bufferIdForEvents,
        cellId: cell.id,
      })
    }, 500)
  }, [bufferIdForEvents, cell.id])
  useEffect(() => {
    return () => {
      if (updateEmitTimerRef.current !== null) {
        clearTimeout(updateEmitTimerRef.current)
      }
    }
  }, [])

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (isExternalSyncRef.current) return
      if (value === undefined) return
      if (exceedsCellLineLimit(value)) {
        // Reject the edit (e.g. an oversized paste) by undoing it, mirroring
        // the SQL editor's hard line cap.
        editorRef.current?.trigger("line-limit", "undo", null)
        toast.error("Maximum line limit reached")
        return
      }
      const viewState = editorRef.current?.saveViewState() ?? undefined
      updateCell(cell.id, { value, editorViewState: viewState })
      signalUserEdit()
      scheduleUpdateEvent()
    },
    [cell.id, updateCell, editorRef, scheduleUpdateEvent],
  )

  // <Editor defaultValue> only seeds on mount — push external edits (AI
  // tools, duplicate clone, remote load) through executeEdits so undo
  // history survives.
  useEffect(() => {
    const ed = editorRef.current
    if (!ed) return
    if (ed.getValue() === cell.value) return
    const model = ed.getModel()
    if (!model) return
    isExternalSyncRef.current = true
    try {
      ed.executeEdits("external-sync", [
        {
          range: model.getFullModelRange(),
          text: cell.value,
          forceMoveMarkers: true,
        },
      ])
    } finally {
      isExternalSyncRef.current = false
    }
  }, [cell.value, editorRef])

  useEffect(() => {
    editorRef.current?.updateOptions({
      scrollbar: { handleMouseWheel: isFocused },
    })
  }, [isFocused, editorRef])

  const middleSum = useCallback(() => {
    if (!isMaximized) return topHeight + bottomHeight
    const editorH =
      editorContainerRef.current?.getBoundingClientRect().height ?? 0
    const bottomH = resultRef.current?.getBoundingClientRect().height ?? 0
    return editorH + bottomH
  }, [isMaximized, topHeight, bottomHeight])

  const middleResizeLive = useCallback(
    (height: number) => {
      const sum = middleSum()
      const { top, bottom } = partitionCellHeights(
        sum,
        height,
        MIN_EDITOR_HEIGHT,
        MIN_BOTTOM_HEIGHT_PX,
      )
      if (isMaximized) {
        setSpotlightLiveRatio(top / (top + bottom))
        return
      }
      topResize.resizeLive(top)
      bottomResize.resizeLive(bottom)
    },
    [isMaximized, middleSum, topResize, bottomResize],
  )

  const middleResizeEnd = useCallback(
    (height: number) => {
      const sum = middleSum()
      const { top, bottom } = partitionCellHeights(
        sum,
        height,
        MIN_EDITOR_HEIGHT,
        MIN_BOTTOM_HEIGHT_PX,
      )
      if (isMaximized) {
        setSpotlightLiveRatio(null)
        updateCell(cell.id, { spotlightEditorRatio: top / (top + bottom) })
        return
      }
      topResize.resizeEnd(top)
      bottomResize.resizeEnd(bottom)
    },
    [isMaximized, middleSum, topResize, bottomResize, cell.id, updateCell],
  )

  const resetToDefaults = useCallback(() => {
    if (isMaximized) {
      setSpotlightLiveRatio(null)
      updateCell(cell.id, { spotlightEditorRatio: undefined })
      return
    }
    bottomResize.resetHeight()
    topResize.resetHeight()
  }, [isMaximized, bottomResize, topResize, cell.id, updateCell])

  const resetBottomArea = useCallback(() => {
    if (isMaximized) {
      setSpotlightLiveRatio(null)
      updateCell(cell.id, { spotlightEditorRatio: undefined })
      return
    }
    if (showBottomSlot) bottomResize.resetHeight()
    else topResize.resetHeight()
  }, [
    isMaximized,
    showBottomSlot,
    bottomResize,
    topResize,
    cell.id,
    updateCell,
  ])

  // When a chart is maximized the BottomSlot fills the whole cell, so its
  // measured height IS the cell total — scale top/bottom to that new total
  // (preserving the split so it's intact when the chart is restored).
  const maximizedChartResizeLive = useCallback(
    (newTotalHeight: number) => {
      const { top, bottom } = scaleCellHeights(
        topHeight,
        bottomHeight,
        newTotalHeight,
        MIN_EDITOR_HEIGHT,
        MIN_BOTTOM_HEIGHT_PX,
      )
      topResize.resizeLive(top)
      bottomResize.resizeLive(bottom)
    },
    [topHeight, bottomHeight, topResize, bottomResize],
  )

  const maximizedChartResizeEnd = useCallback(
    (newTotalHeight: number) => {
      const { top, bottom } = scaleCellHeights(
        topHeight,
        bottomHeight,
        newTotalHeight,
        MIN_EDITOR_HEIGHT,
        MIN_BOTTOM_HEIGHT_PX,
      )
      topResize.resizeEnd(top)
      bottomResize.resizeEnd(bottom)
    },
    [topHeight, bottomHeight, topResize, bottomResize],
  )

  useEffect(() => {
    const handler = (payload?: { cellId?: string }) => {
      if (payload?.cellId !== cell.id) return
      resetBottomArea()
    }
    eventBus.subscribe(EventType.NOTEBOOK_CELL_RESET_SIZE, handler)
    return () =>
      eventBus.unsubscribe(EventType.NOTEBOOK_CELL_RESET_SIZE, handler)
  }, [cell.id, resetBottomArea])

  useEffect(() => {
    if (!isRunning) firstRunRef.current = false
  }, [isRunning])

  // The toolbar's "View table" / "Refresh now" (grid) drive a run, and
  // "View chart" enters draw mode — both routed here so they reuse the same
  // run / validated-draw logic as the Run / Draw toggle buttons.
  useEffect(() => {
    const runHandler = (payload?: { cellId?: string }) => {
      if (payload?.cellId !== cell.id) return
      refreshRun()
    }
    const drawHandler = (payload?: { cellId?: string; maximize?: boolean }) => {
      if (payload?.cellId !== cell.id) return
      void handleDrawClick().then((entered) => {
        if (entered && payload.maximize) setCellViewMaximized(cell.id, true)
      })
    }
    eventBus.subscribe(EventType.NOTEBOOK_CELL_RUN, runHandler)
    eventBus.subscribe(EventType.NOTEBOOK_CELL_DRAW, drawHandler)
    return () => {
      eventBus.unsubscribe(EventType.NOTEBOOK_CELL_RUN, runHandler)
      eventBus.unsubscribe(EventType.NOTEBOOK_CELL_DRAW, drawHandler)
    }
  }, [cell.id, refreshRun, handleDrawClick, setCellViewMaximized])

  const handleRunClick = useCallback(() => runAll(), [runAll])
  const handleHideResult = useCallback(
    () => clearCellResult(cell.id),
    [cell.id, clearCellResult],
  )
  const handleCancelClick = useCallback(
    () => cancelCell(cell.id),
    [cell.id, cancelCell],
  )
  const handleDraw = useCallback(
    () => void handleDrawClick(),
    [handleDrawClick],
  )

  useEffect(() => {
    if (!isFocused && !isMaximized) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "Enter") return
      // Focus inside Monaco: its own action handles the key (same resolver), so
      // bail to avoid running twice.
      if (editorContainerRef.current?.contains(document.activeElement)) return
      e.preventDefault()
      if (e.shiftKey) runAll()
      else runSingle()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isFocused, isMaximized, runAll, runSingle])

  const cellEl = (
    <CellWrapper
      ref={wrapperRef}
      data-cell-id={cell.id}
      tabIndex={-1}
      $focused={isFocused}
      $maximized={isMaximized}
      $gridMode={layoutMode === "grid" && !isMaximized}
      {...wrapperHandlers}
    >
      <CellDragHeader
        cellId={cell.id}
        cell={cell}
        cellIndex={index}
        totalCells={totalCells}
        layoutMode={layoutMode}
        isMaximized={isMaximized}
        headerRef={headerRef}
        toolbarTier={toolbarTier}
        chartZoomed={chartZoomed}
        left={
          <CellNameLabel
            name={cell.name}
            onRename={(name) =>
              updateCell(cell.id, { name: name || undefined })
            }
          />
        }
        right={
          toolbarTier === "compact" ? null : view === "none" ? (
            // Neutral: action verbs (Run / Draw) — labelled only when expanded.
            <CellRunDrawToggles
              isRunning={isRunning}
              isChartLoading={chartLoading}
              runActive={runActive}
              isDrawMode={isDrawMode}
              canRun={canRun}
              autoRefreshOn={cell.autoRefresh !== false}
              showLabels={toolbarTier === "expanded"}
              onRun={handleRunClick}
              onHideResult={handleHideResult}
              onCancel={handleCancelClick}
              onDraw={handleDraw}
            />
          ) : toolbarTier === "expanded" ? (
            <CellWideActions
              cellId={cell.id}
              view={view}
              autoRefresh={cell.autoRefresh ?? true}
              isViewMaximized={isViewMaximized}
              isRunning={isRunning}
              isGridLoading={isGridLoading}
              isChartLoading={chartLoading}
              isChartRefreshing={chartRefreshing}
              chartZoomed={chartZoomed}
            />
          ) : (
            // Standard tier with a result: the compact (label-less) view toggle.
            <CellViewToggle
              cellId={cell.id}
              view={view}
              isViewMaximized={isViewMaximized}
              isGridLoading={isGridLoading}
              isChartLoading={chartLoading}
              chartZoomed={chartZoomed}
              showLabels={false}
            />
          )
        }
      />
      {!isViewMaximized && (
        <EditorContainer
          ref={editorContainerRef}
          $spotlight={isMaximized}
          style={
            isMaximized ? { flex: spotlightEditorRatio } : { height: topHeight }
          }
        >
          <Editor
            defaultValue={cell.value}
            language={QuestDBLanguageName}
            theme="dracula"
            // Default is the literal text "loading..."; the container already
            // shows the editor background, so render nothing until Monaco mounts
            // instead of a flashing placeholder.
            loading={null}
            onMount={handleRevealMount}
            onChange={handleEditorChange}
            options={{
              useShadowDOM: false,
              automaticLayout: true,
              occurrencesHighlight: "off",
              overviewRulerLanes: 0,
              minimap: { enabled: false },
              stickyScroll: {
                enabled: false,
              },
              scrollbar: {
                useShadows: false,
                handleMouseWheel: isFocused,
                alwaysConsumeMouseWheel: false,
              },
              folding: false,
              renderLineHighlight: "gutter",
              glyphMargin: toolbarTier !== "compact",
              lineDecorationsWidth: toolbarTier === "compact" ? 16 : 24,
              lineNumbers: toolbarTier === "compact" ? "off" : "on",
              lineNumbersMinChars: 3,
              scrollBeyondLastLine: false,
              wordWrap: "off",
              padding: { top: 4, bottom: 4 },
              fontSize: 14,
              lineHeight: 24,
              fixedOverflowWidgets: true,
            }}
          />
        </EditorContainer>
      )}
      {/* Inner-top resize handle (between editor and bottom slot). Only
          rendered in double-view, since there's nothing below in single-
          view. Renders in every layout mode (list / grid / spotlight). */}
      {isSplit && (
        <ResizeHandle
          background={theme.color.editorBackground}
          targetRef={editorContainerRef}
          onResize={middleResizeLive}
          onResizeEnd={middleResizeEnd}
          onDoubleClick={resetToDefaults}
          doubleView={doubleView}
        />
      )}
      {/* Bottom slot: result grid OR chart, OR chart filling the whole cell
          when expanded. */}
      {showBottomSlot && (
        <BottomSlot
          ref={resultRef}
          $spotlight={isMaximized}
          style={
            isViewMaximized
              ? isMaximized
                ? { flex: 1 }
                : { height: topHeight + bottomHeight }
              : isMaximized
                ? { flex: 1 - spotlightEditorRatio }
                : { height: bottomHeight }
          }
        >
          {isDrawMode ? (
            <DrawCanvas
              cell={cell}
              bufferId={bufferIdForEvents}
              isFocused={isFocused}
              onConfigChange={handleChartConfigChange}
            />
          ) : cell.result ? (
            <InlineResultTable
              result={cell.result}
              isFocused={isFocused}
              onTabChange={(index) => setActiveResultIndex(cell.id, index)}
              onCancelQuery={(index) => {
                cancelQuery(cell.id, index)
              }}
              bufferId={bufferIdForEvents}
              cellId={cell.id}
              isRunning={isRunning}
              onReRun={(index) => void reRunResultAt(cell.id, index)}
              onYieldFocus={() => editorRef.current?.focus()}
            />
          ) : expectingResult ? (
            <HydrationLoader>
              <CircleNotchSpinner size={24} />
            </HydrationLoader>
          ) : null}
        </BottomSlot>
      )}
    </CellWrapper>
  )

  // The bottom-edge handle lives outside CellWrapper (which clips its content)
  // so its chip can straddle the cell border, mirroring grid's `s` handle.
  const bottomHandle =
    !isMaximized && layoutMode !== "grid" ? (
      <ResizeHandle
        overlay
        targetRef={
          isViewMaximized || showBottomSlot ? resultRef : editorContainerRef
        }
        onResize={
          isViewMaximized
            ? maximizedChartResizeLive
            : showBottomSlot
              ? bottomResize.resizeLive
              : topResize.resizeLive
        }
        onResizeEnd={
          isViewMaximized
            ? maximizedChartResizeEnd
            : showBottomSlot
              ? bottomResize.resizeEnd
              : topResize.resizeEnd
        }
        onDoubleClick={isViewMaximized ? resetToDefaults : resetBottomArea}
        minHeight={
          isViewMaximized
            ? MIN_EDITOR_HEIGHT + MIN_BOTTOM_HEIGHT_PX
            : showBottomSlot
              ? MIN_BOTTOM_HEIGHT_PX
              : undefined
        }
      />
    ) : null

  if (bottomHandle) {
    return (
      <CellShell>
        {cellEl}
        {bottomHandle}
      </CellShell>
    )
  }

  return cellEl
}

export const Cell = React.memo(CellInner)
