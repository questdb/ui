import React, { useCallback, useEffect, useRef } from "react"
import styled, { css, useTheme } from "styled-components"
import { color } from "../../../../utils"
import { Editor } from "@monaco-editor/react"
import { QuestDBLanguageName, stripSQLComments } from "../../Monaco/utils"
import { QuestContext } from "../../../../providers/QuestProvider"
import { useNotebookActions, useNotebookBufferId } from "../NotebookProvider"
import { CellDragHeader } from "./CellDragHeader"
import { CellRunDrawToggles } from "./CellRunDrawToggles"
import { CellWideActions } from "./CellWideActions"
import { CellViewToggle } from "./CellViewToggle"
import { CellNameLabel } from "./CellNameLabel"
import { useChartLoading } from "./useChartLoading"
import { useChartZoomed } from "./useChartZoomed"
import { useCellToolbarTier } from "./useCellToolbarTier"
import { useCellWrapperInteractions } from "./useCellWrapperInteractions"
import { ResizeHandle } from "../resize"
import { CellWrapper } from "./CellWrapper"
import type { ChartConfig } from "../CellChart/chartTypes"
import type { NotebookCell } from "../../../../store/notebook"
import { exceedsCellLineLimit } from "../../../../store/notebook"
import { useCellSelectionDecoration } from "./useCellSelectionDecoration"
import { useMonacoCellEditor } from "./useMonacoCellEditor"
import { useCellReveal } from "./useCellReveal"
import {
  emitUserAction,
  signalUserEdit,
} from "../../../../utils/notebooks/notebookAIBridge"
import { toast } from "../../../../components/Toast"
import {
  CELL_EDITOR_LINE_HEIGHT,
  CELL_EDITOR_PADDING,
  isDoubleView,
  isExpectingResult,
  MIN_BOTTOM_HEIGHT_PX,
  resolveCellView,
} from "../notebookUtils"
import {
  useCellContentMode,
  useCellVirtualizationEngine,
} from "../cellVirtualization/CellVirtualizationContext"
import { useCellResultStatus } from "../resultHydration/CellResultHydrationContext"
import { EditorShimmer } from "../cellVirtualization/EditorShimmer"
import { useValidateWithGlobals } from "../globals/useValidateWithGlobals"
import { useCellRunActions } from "./useCellRunActions"
import {
  MIN_EDITOR_HEIGHT,
  useCellResizeOrchestration,
} from "./useCellResizeOrchestration"
import { CellBottomContent } from "./CellBottomContent"

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

// Screen-reader-only: the shimmer placeholders are aria-hidden, so a
// browse-mode cursor landing on a virtualized cell needs an announced state.
const HiddenCellStatus = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`

type Props = {
  cell: NotebookCell
  index: number
  totalCells: number
  layoutMode?: "list" | "grid"
  isFocused: boolean
  isMaximized: boolean
  isRunning: boolean
}

const CellInner: React.FC<Props> = ({
  cell,
  index,
  totalCells,
  layoutMode = "list",
  isFocused,
  isMaximized,
  isRunning,
}) => {
  const { setCellChartConfig, clearCellResult, updateCell, setFocusedCell } =
    useNotebookActions()
  const theme = useTheme()
  const { quest } = React.useContext(QuestContext)
  const bufferIdForEvents = useNotebookBufferId()
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

  const toolbarTier = useCellToolbarTier(headerRef, isMaximized)
  const { loading: chartLoading, refreshing: chartRefreshing } =
    useChartLoading(cell.id)
  const chartZoomed = useChartZoomed(cell.id)
  const contentMode = useCellContentMode(cell.id)
  const virtualizationEngine = useCellVirtualizationEngine()
  const resultStatus = useCellResultStatus(cell.id)

  const contentHeightGetterRef = useRef<() => number | null>(() => null)
  const getEditorContentHeight = useCallback(
    () => contentHeightGetterRef.current(),
    [],
  )

  const validateWithGlobals = useValidateWithGlobals()

  const handleChartConfigChange = (config: ChartConfig) => {
    signalUserEdit(bufferIdForEvents)
    setCellChartConfig(cell.id, config)
  }

  // A run cell that had a persisted result (lastRunStatus is set, known
  // synchronously from the view state) reserves its result area from the FIRST
  // render while the snapshot hydrates; computeCellGridH reserves the same space
  // in the grid item's height (both go through computeCellHeights).
  const expectingResult = isExpectingResult(cell, resultStatus)
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

  const {
    topHeight,
    bottomHeight,
    spotlightEditorRatio,
    topResize,
    bottomResize,
    middleResizeLive,
    middleResizeEnd,
    resetToDefaults,
    resetBottomArea,
    maximizedChartResizeLive,
    maximizedChartResizeEnd,
  } = useCellResizeOrchestration({
    cell,
    layoutMode,
    isMaximized,
    showBottomSlot,
    expectingResult,
    editorContainerRef,
    resultRef,
    getEditorContentHeight,
  })

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
    editorMounted: !isViewMaximized && contentMode === "full",
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
    bufferIdForEvents,
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

  const { runAll, runSingle, handleDrawClick, isGridLoading } =
    useCellRunActions({
      cell,
      isRunning,
      isCompactTier,
      showBottomSlot,
      editorRef,
      applyHighlight,
      clearHighlight,
    })

  const isExternalSyncRef = useRef(false)

  // 500 ms-debounced — one event per cell per typing burst keeps the digest tiny.
  const updateEmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleUpdateEvent = useCallback(() => {
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
      signalUserEdit(bufferIdForEvents)
      scheduleUpdateEvent()
    },
    [cell.id, bufferIdForEvents, updateCell, editorRef, scheduleUpdateEvent],
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
      // Any focus landing in the cell pins it (keyboard/SR users reach grid
      // and chart controls without mousedown or Monaco focus), so the focused
      // subtree can't virtualize away beneath them.
      onFocusCapture={() => {
        setFocusedCell(cell.id)
        if (contentMode !== "full")
          virtualizationEngine?.ensureFullContent(cell.id)
      }}
      // Focus moved to another element outside an out-of-band cell: release
      // its pins so it can virtualize away
      onBlurCapture={(e) => {
        const next = e.relatedTarget as Node | null
        if (!next || e.currentTarget.contains(next)) return
        if (virtualizationEngine?.isInBand(cell.id) ?? true) return
        virtualizationEngine?.releaseRevealPin(cell.id)
        if (isFocused) setFocusedCell(null)
      }}
    >
      {contentMode === "placeholder" && (
        <HiddenCellStatus>
          Cell content is unloaded while off screen; focus the cell to load it.
        </HiddenCellStatus>
      )}
      <CellDragHeader
        cellId={cell.id}
        cell={cell}
        cellIndex={index}
        totalCells={totalCells}
        layoutMode={layoutMode}
        isMaximized={isMaximized}
        isRunning={isRunning}
        headerRef={headerRef}
        toolbarTier={toolbarTier}
        chartZoomed={chartZoomed}
        left={
          <CellNameLabel
            name={cell.name}
            onRename={(name) => {
              updateCell(cell.id, { name: name || undefined })
              signalUserEdit(bufferIdForEvents)
            }}
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
              onRun={runAll}
              onHideResult={() => {
                signalUserEdit(bufferIdForEvents)
                clearCellResult(cell.id)
              }}
              onDraw={() => void handleDrawClick()}
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
              isRunning={isRunning}
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
          {contentMode === "full" ? (
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
                padding: CELL_EDITOR_PADDING,
                fontSize: 14,
                lineHeight: CELL_EDITOR_LINE_HEIGHT,
                fixedOverflowWidgets: true,
              }}
            />
          ) : (
            <EditorShimmer
              value={cell.value}
              compact={toolbarTier === "compact"}
            />
          )}
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
          <CellBottomContent
            cell={cell}
            contentMode={contentMode}
            expectingResult={expectingResult}
            isFocused={isFocused}
            isRunning={isRunning}
            onConfigChange={handleChartConfigChange}
            onYieldFocus={() => editorRef.current?.focus()}
          />
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
