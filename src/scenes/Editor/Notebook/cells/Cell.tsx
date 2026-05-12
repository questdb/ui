import React, { useCallback, useEffect, useRef } from "react"
import styled, { css, useTheme } from "styled-components"
import { Editor } from "@monaco-editor/react"
import {
  QuestDBLanguageName,
  getQueryFromCursor,
  getAllQueries,
  normalizeQueryText,
  stripSQLComments,
} from "../../Monaco/utils"
import { PlayIcon, CancelIcon } from "../../Monaco/icons"
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
import { emitUserAction } from "../../../../utils/notebookAIBridge"
import { requireAllDQL } from "../../../../utils/tools/permissions"
import { toast } from "../../../../components/Toast"

const MIN_EDITOR_HEIGHT = 72
const MAX_EDITOR_HEIGHT = 600
const MIN_RESULT_HEIGHT = 40

const RunBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
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

const EditorContainer = styled.div<{
  $height: number
  $maximized: boolean
  $maximizedHeight?: number
  $gridMode?: boolean
  $gridEditorHeight?: number
}>`
  ${({
    $maximized,
    $height,
    $maximizedHeight,
    $gridMode,
    $gridEditorHeight,
  }) =>
    $gridMode
      ? $gridEditorHeight
        ? css`
            height: ${$gridEditorHeight}px;
            min-height: 0;
            overflow: hidden;
            flex-shrink: 0;
          `
        : css`
            flex: 1;
            min-height: 0;
            overflow: hidden;
          `
      : $maximized
        ? $maximizedHeight
          ? css`
              height: ${$maximizedHeight}px;
              min-height: ${MIN_EDITOR_HEIGHT}px;
            `
          : css`
              flex: 1;
              min-height: 0;
            `
        : css`
            height: ${$height}px;
            min-height: ${MIN_EDITOR_HEIGHT}px;
          `}
`

type Props = {
  cell: NotebookCell
  layoutMode?: "list" | "grid"
  isFocused: boolean
  isMaximized: boolean
  isRunning: boolean
}

const CellInner: React.FC<Props> = ({
  cell,
  layoutMode = "list",
  isFocused,
  isMaximized,
  isRunning,
}) => {
  const {
    runCell,
    runCellScript,
    cancelCell,
    cancelQuery,
    setActiveResultIndex,
    setCellMode,
    setCellChartConfig,
    setCellAutoRefresh,
    setCellChartMaximized,
    updateCell,
    setFocusedCell,
  } = useNotebookActions()
  const theme = useTheme()
  const { quest } = React.useContext(QuestContext)
  const { activeBuffer } = useEditor()
  const bufferIdForEvents =
    typeof activeBuffer.id === "number" ? activeBuffer.id : undefined
  const isDrawMode = cell.mode === "draw"
  const isChartMaximized = isDrawMode && !!cell.isChartMaximized

  const editorContainerRef = useRef<HTMLDivElement | null>(null)
  const resultRef = useRef<HTMLDivElement | null>(null)

  const editorResize = useCellResize(
    MIN_EDITOR_HEIGHT,
    useCallback(
      (height: number) => updateCell(cell.id, { customHeight: height }),
      [cell.id, updateCell],
    ),
    useCallback(
      () => updateCell(cell.id, { customHeight: undefined }),
      [cell.id, updateCell],
    ),
  )
  const maximizedResize = useCellResize(
    MIN_EDITOR_HEIGHT,
    useCallback(
      (height: number) =>
        updateCell(cell.id, { customMaximizedHeight: height }),
      [cell.id, updateCell],
    ),
    useCallback(
      () => updateCell(cell.id, { customMaximizedHeight: undefined }),
      [cell.id, updateCell],
    ),
  )
  const gridEditorResize = useCellResize(
    MIN_EDITOR_HEIGHT,
    useCallback(
      (height: number) =>
        updateCell(cell.id, { customGridEditorHeight: height }),
      [cell.id, updateCell],
    ),
    useCallback(
      () => updateCell(cell.id, { customGridEditorHeight: undefined }),
      [cell.id, updateCell],
    ),
  )
  const resultResize = useCellResize(
    MIN_RESULT_HEIGHT,
    useCallback(
      (height: number) => updateCell(cell.id, { customResultHeight: height }),
      [cell.id, updateCell],
    ),
    useCallback(
      () => updateCell(cell.id, { customResultHeight: undefined }),
      [cell.id, updateCell],
    ),
  )

  const handleChartConfigChange = useCallback(
    (config: ChartConfig) => setCellChartConfig(cell.id, config),
    [cell.id, setCellChartConfig],
  )
  const handleAutoRefreshChange = useCallback(
    (value: boolean) => setCellAutoRefresh(cell.id, value),
    [cell.id, setCellAutoRefresh],
  )
  const handleChartMaximizedChange = useCallback(
    (value: boolean) => setCellChartMaximized(cell.id, value),
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
        quest.validateQuery(s),
      )
      if (!decision.granted) {
        toast.error(decision.reason)
        return
      }
      setCellMode(cell.id, "draw")
      setCellChartMaximized(cell.id, true)
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
    quest,
  ])

  const exitDrawIfNeeded = useCallback(() => {
    if (isDrawMode) setCellMode(cell.id, "run")
  }, [cell.id, isDrawMode, setCellMode])

  const liveEditorHeight = editorResize.liveHeight
  const liveMaximizedHeight = maximizedResize.liveHeight
  const liveGridEditorHeight = gridEditorResize.liveHeight
  const liveResultHeight = resultResize.liveHeight
  const maximizedEditorHeight =
    liveMaximizedHeight ?? cell.customMaximizedHeight
  const gridEditorHeight = liveGridEditorHeight ?? cell.customGridEditorHeight

  const { editorRef, monacoRef, autoHeight, handleEditorMount } =
    useMonacoCellEditor({
      cellId: cell.id,
      editorViewState: cell.editorViewState,
      isMaximized,
      minEditorHeight: MIN_EDITOR_HEIGHT,
      maxEditorHeight: MAX_EDITOR_HEIGHT,
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
    })

  const editorHeight = liveEditorHeight ?? cell.customHeight ?? autoHeight

  const { applyHighlight, clearHighlight } = useCellSelectionDecoration(
    editorRef,
    monacoRef,
  )

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
    (success: boolean) => {
      if (bufferIdForEvents === undefined) return
      emitUserAction({
        kind: "user_ran_cell",
        bufferId: bufferIdForEvents,
        cellId: cell.id,
        status: success ? "success" : "error",
      })
    },
    [bufferIdForEvents, cell.id],
  )

  const handleRunAll = useCallback(async () => {
    if (await tryRunSelection()) return
    const ed = editorRef.current
    if (!ed) return

    clearHighlight()

    const allQueries = getAllQueries(ed)
    if (allQueries.length === 0) return

    if (allQueries.length === 1) {
      const ok = await runCell(cell.id)
      emitRanEvent(ok)
    } else {
      const queryTexts = allQueries
        .map((q) => normalizeQueryText(q.query))
        .filter((q) => q.length > 0)
      await runCellScript(cell.id, queryTexts)
      emitRanEvent(true)
    }
  }, [
    cell.id,
    runCell,
    runCellScript,
    tryRunSelection,
    editorRef,
    clearHighlight,
    emitRanEvent,
  ])

  const handleRunAtCursor = useCallback(async () => {
    if (await tryRunSelection()) return
    const ed = editorRef.current
    if (!ed) return

    clearHighlight()

    const queryAtCursor = getQueryFromCursor(ed)
    if (queryAtCursor) {
      void runCell(cell.id, normalizeQueryText(queryAtCursor.query))
    } else {
      void runCell(cell.id)
    }
  }, [cell.id, runCell, tryRunSelection, editorRef, clearHighlight])

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
      if (value !== undefined) {
        const viewState = editorRef.current?.saveViewState() ?? undefined
        updateCell(cell.id, { value, editorViewState: viewState })
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
    ed.executeEdits("external-sync", [
      {
        range: model.getFullModelRange(),
        text: cell.value,
        forceMoveMarkers: true,
      },
    ])
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

  return (
    <CellWrapper
      $focused={isFocused}
      $maximized={isMaximized}
      $gridMode={layoutMode === "grid"}
      onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest?.(".cell-drag-handle")) {
          e.stopPropagation()
        }
        setFocusedCell(cell.id)
      }}
    >
      {!isChartMaximized && (
        <RunBar className="cell-drag-handle">
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
                title="Run (Ctrl+Enter)"
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
          $height={editorHeight}
          $maximized={isMaximized}
          $maximizedHeight={maximizedEditorHeight}
          $gridMode={layoutMode === "grid"}
          $gridEditorHeight={
            // In grid mode the editor must NOT take flex:1 once content
            // follows it — otherwise the result table renders 0px tall.
            cell.result || isDrawMode
              ? (gridEditorHeight ?? autoHeight)
              : undefined
          }
        >
          <Editor
            defaultValue={cell.value}
            language={QuestDBLanguageName}
            theme="dracula"
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
              },
              folding: false,
              renderLineHighlight: "gutter",
              glyphMargin: true,
              lineDecorationsWidth: 24,
              lineNumbersMinChars: 3,
              scrollBeyondLastLine: false,
              wordWrap: "on",
              padding: { top: 4, bottom: 4 },
              fontSize: 14,
              lineHeight: 24,
            }}
          />
        </EditorContainer>
      )}
      {!isChartMaximized &&
        (layoutMode === "grid" ? (
          (cell.result || isDrawMode) && (
            <ResizeHandle
              targetRef={editorContainerRef}
              onResize={gridEditorResize.resizeLive}
              onResizeEnd={gridEditorResize.resizeEnd}
              onDoubleClick={gridEditorResize.resetHeight}
            />
          )
        ) : (
          <ResizeHandle
            background={theme.color.editorBackground}
            targetRef={editorContainerRef}
            onResize={
              isMaximized ? maximizedResize.resizeLive : editorResize.resizeLive
            }
            onResizeEnd={
              isMaximized ? maximizedResize.resizeEnd : editorResize.resizeEnd
            }
            onDoubleClick={
              isMaximized
                ? maximizedResize.resetHeight
                : editorResize.resetHeight
            }
          />
        ))}
      {isDrawMode ? (
        <>
          <div
            ref={resultRef}
            style={
              isMaximized || layoutMode === "grid"
                ? {
                    flex: 1,
                    minHeight: 0,
                    display: "flex",
                    flexDirection: "column",
                  }
                : {
                    // List + non-maximized: parent isn't flex, so use an
                    // explicit height (live drag → persisted → viewport).
                    height:
                      liveResultHeight != null
                        ? `${liveResultHeight}px`
                        : cell.customResultHeight
                          ? `${cell.customResultHeight}px`
                          : "60vh",
                    display: "flex",
                    flexDirection: "column",
                  }
            }
          >
            <DrawCanvas
              cell={cell}
              isFocused={isFocused}
              onConfigChange={handleChartConfigChange}
              onAutoRefreshChange={handleAutoRefreshChange}
              onMaximizedChange={handleChartMaximizedChange}
            />
          </div>
          {!isMaximized && layoutMode !== "grid" && (
            <ResizeHandle
              targetRef={resultRef}
              onResize={resultResize.resizeLive}
              onResizeEnd={resultResize.resizeEnd}
              onDoubleClick={resultResize.resetHeight}
            />
          )}
        </>
      ) : (
        cell.result && (
          <>
            <div
              ref={resultRef}
              style={
                isMaximized || layoutMode === "grid"
                  ? {
                      flex: 1,
                      minHeight: 0,
                      display: "flex",
                      flexDirection: "column",
                    }
                  : undefined
              }
            >
              <InlineResultTable
                result={cell.result}
                isFocused={isFocused}
                isMaximized={isMaximized || layoutMode === "grid"}
                customHeight={
                  layoutMode === "grid"
                    ? undefined
                    : (liveResultHeight ?? cell.customResultHeight)
                }
                onTabChange={(index) => setActiveResultIndex(cell.id, index)}
                onCancelQuery={(index) => {
                  cancelQuery(cell.id, index)
                }}
              />
            </div>
            {!isMaximized && layoutMode !== "grid" && (
              <ResizeHandle
                targetRef={resultRef}
                onResize={resultResize.resizeLive}
                onResizeEnd={resultResize.resizeEnd}
                onDoubleClick={resultResize.resetHeight}
              />
            )}
          </>
        )
      )}
    </CellWrapper>
  )
}

export const Cell = React.memo(CellInner)
