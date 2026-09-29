import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { NotebookCell } from "../../../../store/notebook"
import { useNotebookActions, useNotebookBufferId } from "../NotebookProvider"
import { useCellResize } from "./useCellResize"
import { signalUserEdit } from "../../../../utils/notebooks/notebookAIBridge"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import {
  MAX_PANE_HEIGHT_PX,
  MIN_EDITOR_HEIGHT,
  clampPaneHeight,
  computeCellHeights,
  gridBoxRowsChange,
  hasAgentVisibleCellHeightChanged,
  minBottomHeightFor,
  partitionCellHeights,
  topHeightForSql,
} from "../cellSizing"

type Options = {
  cell: NotebookCell
  layoutMode: "list" | "grid"
  isMaximized: boolean
  isSplit: boolean
  showBottomSlot: boolean
  expectingResult: boolean
  editorContainerRef: React.RefObject<HTMLDivElement | null>
  resultRef: React.RefObject<HTMLDivElement | null>
  getEditorContentHeight: () => number | null
}

// Every way a cell's editor / result panes can be resized — the split handle,
// the bottom-edge handle, the spotlight ratio, and their double-click resets —
// plus the derived top/bottom heights the layout renders from.
//
// The split handle owns the editor pane only. The result keeps its own height
// and the cell grows with the editor, the same way Monaco auto-grow does. The
// drag is local state; the store is written on drop, and in grid layout also
// whenever the box needs another row, so it follows the drag without a
// notebook-wide render per pointer move. A maximized cell fills the viewport,
// so there the handle moves the editor/result ratio instead.
export const useCellResizeOrchestration = ({
  cell,
  layoutMode,
  isMaximized,
  isSplit,
  showBottomSlot,
  expectingResult,
  editorContainerRef,
  resultRef,
  getEditorContentHeight,
}: Options) => {
  const { updateCell } = useNotebookActions()
  const bufferIdForEvents = useNotebookBufferId()

  const [spotlightLiveRatio, setSpotlightLiveRatio] = useState<number | null>(
    null,
  )
  // A drag that crosses grid rows writes the store mid-drag, so the split
  // handle remembers the cell it started from and signals once, on drop,
  // against that cell: a drag that returns to its start is not an edit.
  const [splitDragStartCell, setSplitDragStartCell] =
    useState<NotebookCell | null>(null)
  const [spotlightSpan, setSpotlightSpan] = useState<number | null>(null)

  // The grid edge handle publishes its reset; the subscription lives for the
  // cell and reads the handler of the current render.
  const resetBottomAreaRef = useRef<(() => void) | null>(null)

  const readResetTopHeight = useCallback(() => {
    const contentHeight = getEditorContentHeight()
    return contentHeight != null
      ? clampPaneHeight(MIN_EDITOR_HEIGHT, contentHeight)
      : topHeightForSql(cell.value)
  }, [cell.value, getEditorContentHeight])

  const signalAgentVisibleHeightChange = useCallback(
    (patch: Partial<NotebookCell>, from: NotebookCell = cell) => {
      if (hasAgentVisibleCellHeightChanged(from, patch)) {
        signalUserEdit(bufferIdForEvents)
      }
    },
    [bufferIdForEvents, cell],
  )

  const topResize = useCellResize(
    MIN_EDITOR_HEIGHT,
    useCallback(
      (height: number) => {
        const patch = { topHeight: height, topResized: true }
        signalAgentVisibleHeightChange(patch)
        updateCell(cell.id, patch)
      },
      [cell.id, signalAgentVisibleHeightChange, updateCell],
    ),
    // Write Monaco's CURRENT content height directly on reset, rather
    // than setting `topHeight: undefined` and waiting for the next
    // `onContentHeightChange` to fill it in. The wait creates a
    // one-frame flicker where `topHeight` falls back to
    // DEFAULT_TOP_HEIGHT (72 px) and the bottom slot jumps up.
    useCallback(() => {
      updateCell(cell.id, {
        topHeight: readResetTopHeight(),
        topResized: false,
      })
    }, [cell.id, readResetTopHeight, updateCell]),
  )
  const bottomResize = useCellResize(
    minBottomHeightFor(cell),
    useCallback(
      (height: number) => {
        const patch = { bottomHeight: height, bottomResized: true }
        signalAgentVisibleHeightChange(patch)
        updateCell(cell.id, patch)
      },
      [cell.id, signalAgentVisibleHeightChange, updateCell],
    ),
    useCallback(
      () =>
        updateCell(cell.id, { bottomHeight: undefined, bottomResized: false }),
      [cell.id, updateCell],
    ),
  )

  // An unpinned result pane sizes itself from the result frame, which formats
  // the statements when the frame text and the SQL differ: once per change,
  // not on every render in between.
  const { topHeight, bottomHeight } = useMemo(
    () =>
      computeCellHeights(cell, {
        liveTopHeight: topResize.liveHeight,
        liveBottomHeight: bottomResize.liveHeight,
        expectingResult,
      }),
    [cell, topResize.liveHeight, bottomResize.liveHeight, expectingResult],
  )

  const spotlightEditorRatio =
    spotlightLiveRatio ??
    cell.spotlightEditorRatio ??
    topHeight / (topHeight + bottomHeight)

  // A maximized cell fills the viewport, so its editor stops where the result
  // pane reaches its floor.
  const splitMaxHeight =
    isMaximized && spotlightSpan !== null
      ? Math.max(MIN_EDITOR_HEIGHT, spotlightSpan - minBottomHeightFor(cell))
      : MAX_PANE_HEIGHT_PX

  const spotlightRatioFor = (height: number) => {
    const editorH =
      editorContainerRef.current?.getBoundingClientRect().height ?? 0
    const bottomH = resultRef.current?.getBoundingClientRect().height ?? 0
    const { top, bottom } = partitionCellHeights(
      editorH + bottomH,
      height,
      MIN_EDITOR_HEIGHT,
      minBottomHeightFor(cell),
    )
    return top / (top + bottom)
  }

  const editorHeightPatch = (height: number) => ({
    topHeight: clampPaneHeight(MIN_EDITOR_HEIGHT, height),
    topResized: true,
  })

  const splitResizeLive = (height: number) => {
    if (isMaximized) {
      setSpotlightLiveRatio(spotlightRatioFor(height))
      return
    }
    if (splitDragStartCell === null) setSplitDragStartCell(cell)
    topResize.resizeLive(height)
    const patch = editorHeightPatch(height)
    if (gridBoxRowsChange(cell, patch, layoutMode, expectingResult)) {
      updateCell(cell.id, patch)
    }
  }

  const splitResizeEnd = (height: number) => {
    if (isMaximized) {
      setSpotlightLiveRatio(null)
      updateCell(cell.id, { spotlightEditorRatio: spotlightRatioFor(height) })
      return
    }
    setSplitDragStartCell(null)
    signalAgentVisibleHeightChange(
      editorHeightPatch(height),
      splitDragStartCell ?? cell,
    )
    topResize.resizeEnd(height)
  }

  const resetSpotlightRatio = () => {
    setSpotlightLiveRatio(null)
    updateCell(cell.id, { spotlightEditorRatio: undefined })
  }

  const resetEditorHeight = () => {
    signalAgentVisibleHeightChange({
      topHeight: readResetTopHeight(),
      topResized: false,
    })
    topResize.resetHeight()
  }

  const resetSplit = isMaximized ? resetSpotlightRatio : resetEditorHeight

  const resetBottomArea = () => {
    if (isMaximized) {
      resetSpotlightRatio()
      return
    }
    if (!showBottomSlot) {
      resetEditorHeight()
      return
    }
    signalAgentVisibleHeightChange({
      bottomHeight: undefined,
      bottomResized: false,
    })
    bottomResize.resetHeight()
  }

  useEffect(() => {
    const editor = editorContainerRef.current
    const result = resultRef.current
    if (!isMaximized || !isSplit || !editor || !result) return
    const observer = new ResizeObserver(() =>
      setSpotlightSpan(
        Math.round(
          editor.getBoundingClientRect().height +
            result.getBoundingClientRect().height,
        ),
      ),
    )
    observer.observe(editor)
    observer.observe(result)
    return () => {
      observer.disconnect()
      setSpotlightSpan(null)
    }
  }, [isMaximized, isSplit, editorContainerRef, resultRef])

  useEffect(() => {
    resetBottomAreaRef.current = resetBottomArea
  })

  useEffect(() => {
    const handler = (payload?: { cellId?: string }) => {
      if (payload?.cellId === cell.id) resetBottomAreaRef.current?.()
    }
    eventBus.subscribe(EventType.NOTEBOOK_CELL_RESET_SIZE, handler)
    return () =>
      eventBus.unsubscribe(EventType.NOTEBOOK_CELL_RESET_SIZE, handler)
  }, [cell.id])

  return {
    topHeight,
    bottomHeight,
    spotlightEditorRatio,
    splitMaxHeight,
    topResize,
    bottomResize,
    splitResizeLive,
    splitResizeEnd,
    resetSplit,
    resetBottomArea,
  }
}
