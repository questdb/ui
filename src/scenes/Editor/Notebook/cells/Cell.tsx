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
import { PlayIcon, CancelIcon, CircleNotchSpinner } from "../../Monaco/icons"
import { ChartLineUpIcon } from "@phosphor-icons/react"
import { QuestContext } from "../../../../providers/QuestProvider"
import { useNotebookActions } from "../NotebookProvider"
import { CellToolbar } from "./CellToolbar"
import { InlineResultTable } from "../result-table"
import { ResizeHandle } from "../resize"
import { CellWrapper } from "./CellWrapper"
import { DrawCanvas } from "../DrawCanvas"
import type { ChartConfig } from "../CellChart/chartTypes"
import type { NotebookCell } from "../../../../store/notebook"
import { useCellResize } from "./useCellResize"
import { useCellSelectionDecoration } from "./useCellSelectionDecoration"
import { useMonacoCellEditor } from "./useMonacoCellEditor"
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
  DEFAULT_TOP_HEIGHT,
  defaultBottomHeightFor,
  isDoubleView,
  isExpectingResult,
  MIN_BOTTOM_HEIGHT_PX,
  partitionCellHeights,
  RESERVED_RESULT_BOTTOM_HEIGHT,
  scaleCellHeights,
  upsertColumnSizing,
} from "../notebookUtils"
import { useValidateWithGlobals } from "../globals/useValidateWithGlobals"

// Minimum content area heights. `MIN_EDITOR_HEIGHT` matches Monaco's reported
// content height for an empty editor (one line + padding); the previous
// `MAX_EDITOR_HEIGHT` cap is gone — the editor now auto-grows freely with
// pasted content (user-confirmed: unbounded).
const MIN_EDITOR_HEIGHT = 72

const RunBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background: ${({ theme }) => theme.color.backgroundDarker};
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
`

const RunButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 0.3rem;
  background: transparent;
  cursor: pointer;
  padding: 0;

  &:hover {
    filter: brightness(1.3);
  }

  &:disabled {
    opacity: 0.3;
    cursor: default;
    filter: none;
  }

  svg {
    width: 2.4rem;
    height: 2.4rem;
  }
`

const RunButtonGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`

const DrawButton = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 0.3rem;
  background: transparent;
  color: ${({ $active, theme }) =>
    $active ? theme.color.cyan : theme.color.cyan};
  cursor: pointer;
  padding: 0;

  &:hover {
    filter: brightness(1.3);
  }

  &:disabled {
    opacity: 0.3;
    cursor: default;
    filter: none;
  }
`

const EditorContainer = styled.div<{ $spotlight: boolean }>`
  overflow: hidden;
  background: ${color("editorBackground")};

  .cursorQueryDecoration {
    width: 0.2rem !important;
    background: ${color("green")};
    margin-left: 0.5rem;
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
  layoutMode?: "list" | "grid"
  isFocused: boolean
  isMaximized: boolean
  isRunning: boolean
  isHydrating: boolean
}

const CellInner: React.FC<Props> = ({
  cell,
  layoutMode = "list",
  isFocused,
  isMaximized,
  isRunning,
  isHydrating,
}) => {
  const {
    runCell,
    cancelCell,
    cancelQuery,
    setActiveResultIndex,
    setCellMode,
    setCellChartConfig,
    setCellAutoRefresh,
    setCellChartMaximized,
    updateCell,
    setFocusedCell,
    getCellsSnapshot,
    moveCellUp,
    moveCellDown,
  } = useNotebookActions()
  const theme = useTheme()
  const { quest } = React.useContext(QuestContext)
  const { activeBuffer } = useEditor()
  const bufferIdForEvents =
    typeof activeBuffer.id === "number" ? activeBuffer.id : undefined
  const isDrawMode = cell.mode === "draw"
  const isChartMaximized = isDrawMode && !!cell.isChartMaximized

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const editorContainerRef = useRef<HTMLDivElement | null>(null)
  const resultRef = useRef<HTMLDivElement | null>(null)

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
      (height: number) => updateCell(cell.id, { bottomHeight: height }),
      [cell.id, updateCell],
    ),
    useCallback(
      () => updateCell(cell.id, { bottomHeight: undefined }),
      [cell.id, updateCell],
    ),
  )

  const handleColumnSizingCommit = useCallback(
    (sizing: Record<string, number>, query: string) => {
      updateCell(cell.id, {
        columnSizing: upsertColumnSizing(cell.columnSizing, query, sizing),
      })
    },
    [cell.id, cell.columnSizing, updateCell],
  )

  const handleChartConfigChange = useCallback(
    (config: ChartConfig) => {
      signalUserEdit()
      setCellChartConfig(cell.id, config)
    },
    [cell.id, setCellChartConfig],
  )
  const handleAutoRefreshChange = useCallback(
    (value: boolean) => {
      signalUserEdit()
      setCellAutoRefresh(cell.id, value)
    },
    [cell.id, setCellAutoRefresh],
  )
  const handleChartMaximizedChange = useCallback(
    (value: boolean) => {
      signalUserEdit()
      setCellChartMaximized(cell.id, value)
    },
    [cell.id, setCellChartMaximized],
  )

  const validatingDrawRef = useRef(false)

  const handleDrawClick = useCallback(async () => {
    if (isDrawMode) {
      setCellMode(cell.id, "run")
      if (bufferIdForEvents !== undefined) {
        emitUserAction({
          kind: "user_changed_cell_mode",
          bufferId: bufferIdForEvents,
          cellId: cell.id,
          mode: "run",
        })
      }
      return
    }
    if (validatingDrawRef.current) return
    validatingDrawRef.current = true
    try {
      const decision = await requireAllDQL(cell.value, (s) =>
        validateWithGlobals(s),
      )
      if (!decision.granted) {
        toast.error(decision.reason)
        return
      }
      setCellMode(cell.id, "draw")
      setCellChartMaximized(cell.id, false)
      if (bufferIdForEvents !== undefined) {
        emitUserAction({
          kind: "user_changed_cell_mode",
          bufferId: bufferIdForEvents,
          cellId: cell.id,
          mode: "draw",
        })
      }
    } finally {
      validatingDrawRef.current = false
    }
  }, [
    cell.id,
    cell.value,
    isDrawMode,
    setCellMode,
    setCellChartMaximized,
    bufferIdForEvents,
    validateWithGlobals,
  ])

  const exitDrawIfNeeded = useCallback(() => {
    if (isDrawMode) {
      signalUserEdit()
      setCellMode(cell.id, "run")
    }
  }, [cell.id, isDrawMode, setCellMode])

  const liveTopHeight = topResize.liveHeight
  const liveBottomHeight = bottomResize.liveHeight

  const topHeight = liveTopHeight ?? cell.topHeight ?? DEFAULT_TOP_HEIGHT
  // A run cell that had a persisted result (lastRunStatus is set, known
  // synchronously from the view state) reserves its result area from the FIRST
  // render while the snapshot hydrates
  // computeCellGridH applies the same reservation to the grid item's height.
  const expectingResult = isExpectingResult(cell, isHydrating)
  const bottomHeight =
    liveBottomHeight ??
    cell.bottomHeight ??
    (expectingResult
      ? RESERVED_RESULT_BOTTOM_HEIGHT
      : defaultBottomHeightFor(cell))
  const doubleView = isDoubleView(cell) || expectingResult

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
    onRunAtCursor: () => void handleRunAtCursor(),
    onRunAll: () => void handleRunAll(),
    onContentHeightChange: handleContentHeightChange,
    validate: validateWithGlobals,
  })

  const { applyHighlight, clearHighlight } = useCellSelectionDecoration(
    editorRef,
    monacoRef,
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

  const handleRunAll = useCallback(async () => {
    if (await tryRunSelection()) return
    if (!editorRef.current) return

    clearHighlight()

    const priorResult =
      getCellsSnapshot().find((c) => c.id === cell.id)?.result ?? null
    const ok = await runCell(cell.id)
    const freshResult =
      getCellsSnapshot().find((c) => c.id === cell.id)?.result ?? null
    emitRanEvent(createRunStatus(priorResult, freshResult, ok))
  }, [
    cell.id,
    runCell,
    tryRunSelection,
    editorRef,
    clearHighlight,
    emitRanEvent,
    getCellsSnapshot,
  ])

  const handleRunAtCursor = useCallback(async () => {
    if (await tryRunSelection()) return
    const ed = editorRef.current
    if (!ed) return

    const queryAtCursor = getQueryFromCursor(ed)
    if (!queryAtCursor) return

    clearHighlight()
    void runCell(cell.id, normalizeQueryText(queryAtCursor.query))
  }, [cell.id, runCell, tryRunSelection, editorRef, clearHighlight])

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
      if (value !== undefined) {
        const viewState = editorRef.current?.saveViewState() ?? undefined
        updateCell(cell.id, { value, editorViewState: viewState })
        signalUserEdit()
        scheduleUpdateEvent()
      }
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

  // Esc blurs the cell. Respect defaultPrevented so a Radix popper close
  // doesn't double up with cell blur on the same keystroke.
  useEffect(() => {
    if (!isFocused) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (e.defaultPrevented) return
      setFocusedCell(null)
      ;(document.activeElement as HTMLElement | null)?.blur?.()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isFocused, setFocusedCell])

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

  const bottomEdgeResizeLive = useCallback(
    (newResultHeight: number) => {
      const { top, bottom } = scaleCellHeights(
        topHeight,
        bottomHeight,
        topHeight + newResultHeight,
        MIN_EDITOR_HEIGHT,
        MIN_BOTTOM_HEIGHT_PX,
      )
      topResize.resizeLive(top)
      bottomResize.resizeLive(bottom)
    },
    [topHeight, bottomHeight, topResize, bottomResize],
  )

  const bottomEdgeResizeEnd = useCallback(
    (newResultHeight: number) => {
      const { top, bottom } = scaleCellHeights(
        topHeight,
        bottomHeight,
        topHeight + newResultHeight,
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
      resetToDefaults()
    }
    eventBus.subscribe(EventType.NOTEBOOK_CELL_RESET_SIZE, handler)
    return () =>
      eventBus.unsubscribe(EventType.NOTEBOOK_CELL_RESET_SIZE, handler)
  }, [cell.id, resetToDefaults])

  const canArrowMove = layoutMode !== "grid" && !isMaximized

  const handleWrapperKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!canArrowMove || e.target !== e.currentTarget) return
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
      e.preventDefault()
      if (e.key === "ArrowUp") moveCellUp(cell.id)
      else moveCellDown(cell.id)
      requestAnimationFrame(() => {
        const node = wrapperRef.current
        if (!node) return
        node.focus({ preventScroll: true })
        node.scrollIntoView({ block: "nearest" })
      })
    },
    [canArrowMove, cell.id, moveCellUp, moveCellDown],
  )

  return (
    <CellWrapper
      ref={wrapperRef}
      data-cell-id={cell.id}
      tabIndex={-1}
      $focused={isFocused}
      $maximized={isMaximized}
      $gridMode={layoutMode === "grid"}
      onKeyDown={handleWrapperKeyDown}
      onMouseDown={(e) => {
        const target = e.target as HTMLElement
        if (!target.closest?.(".cell-drag-handle")) {
          e.stopPropagation()
        }
        setFocusedCell(cell.id)
        if (
          canArrowMove &&
          !target.closest(
            "button, a, input, select, textarea, [contenteditable], .monaco-editor",
          )
        ) {
          wrapperRef.current?.focus({ preventScroll: true })
        }
      }}
    >
      {!isChartMaximized && (
        <RunBar
          className="cell-drag-handle"
          onDoubleClick={(e) => {
            if (layoutMode !== "grid") return
            if (
              (e.target as HTMLElement).closest(
                "button, a, input, select, textarea, .cell-toolbar",
              )
            )
              return
            eventBus.publish(EventType.NOTEBOOK_CELL_EXPAND_WIDTH, {
              cellId: cell.id,
              kind: "full",
            })
          }}
        >
          <RunButtonGroup>
            {isRunning ? (
              <RunButton
                onClick={(e) => {
                  e.stopPropagation()
                  cancelCell(cell.id)
                }}
                title="Cancel"
              >
                <CancelIcon />
              </RunButton>
            ) : (
              <RunButton
                disabled={!stripSQLComments(cell.value).trim()}
                onClick={(e) => {
                  e.stopPropagation()
                  exitDrawIfNeeded()
                  void handleRunAll()
                }}
                title="Run (Ctrl+Shift+Enter)"
              >
                <PlayIcon />
              </RunButton>
            )}
            <DrawButton
              type="button"
              $active={isDrawMode}
              disabled={!stripSQLComments(cell.value).trim()}
              onClick={(e) => {
                e.stopPropagation()
                void handleDrawClick()
              }}
              title={
                isDrawMode
                  ? (cell.autoRefresh ?? true)
                    ? "Drawing — auto-refresh on"
                    : "Refresh chart"
                  : "Draw (auto-refresh chart)"
              }
              aria-label="Draw"
            >
              <ChartLineUpIcon
                size={isDrawMode ? 26 : 24}
                weight={isDrawMode ? "fill" : "regular"}
              />
            </DrawButton>
          </RunButtonGroup>
          <CellToolbar cellId={cell.id} inline />
        </RunBar>
      )}
      {!isChartMaximized && (
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
            onMount={handleEditorMount}
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
              glyphMargin: true,
              lineDecorationsWidth: 24,
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
      {!isChartMaximized && doubleView && (
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
      {(doubleView || isChartMaximized) && (
        <BottomSlot
          ref={resultRef}
          $spotlight={isMaximized}
          style={
            isChartMaximized
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
              onAutoRefreshChange={handleAutoRefreshChange}
              onMaximizedChange={handleChartMaximizedChange}
            />
          ) : cell.result ? (
            <InlineResultTable
              result={cell.result}
              isFocused={isFocused}
              onTabChange={(index) => setActiveResultIndex(cell.id, index)}
              onCancelQuery={(index) => {
                cancelQuery(cell.id, index)
              }}
              columnSizing={cell.columnSizing}
              onColumnSizingCommit={handleColumnSizingCommit}
            />
          ) : expectingResult ? (
            <HydrationLoader>
              <CircleNotchSpinner size={24} />
            </HydrationLoader>
          ) : null}
        </BottomSlot>
      )}
      {!isChartMaximized && !isMaximized && layoutMode !== "grid" && (
        <ResizeHandle
          background={theme.color.editorBackground}
          targetRef={doubleView ? resultRef : editorContainerRef}
          onResize={doubleView ? bottomEdgeResizeLive : topResize.resizeLive}
          onResizeEnd={doubleView ? bottomEdgeResizeEnd : topResize.resizeEnd}
          onDoubleClick={doubleView ? resetToDefaults : topResize.resetHeight}
          minHeight={doubleView ? MIN_BOTTOM_HEIGHT_PX : undefined}
        />
      )}
    </CellWrapper>
  )
}

export const Cell = React.memo(CellInner)
