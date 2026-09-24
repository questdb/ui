import { useCallback, useEffect, useState } from "react"
import type { NotebookCell } from "../../../../store/notebook"
import { useNotebookActions, useNotebookBufferId } from "../NotebookProvider"
import { useCellResize } from "./useCellResize"
import { signalUserEdit } from "../../../../utils/notebooks/notebookAIBridge"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import {
  MIN_EDITOR_HEIGHT,
  clampPaneHeight,
  computeCellHeights,
  hasAgentVisibleCellHeightChanged,
  minBottomHeightFor,
  partitionCellHeights,
  topHeightForSql,
} from "../notebookUtils"

type Options = {
  cell: NotebookCell
  layoutMode: "list" | "grid"
  isMaximized: boolean
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
// and the cell grows with the editor, the same way Monaco auto-grow does. It
// writes through the store on every step so a grid cell's box follows the drag.
// A maximized cell fills the viewport, so there the handle moves the
// editor/result ratio instead.
export const useCellResizeOrchestration = ({
  cell,
  layoutMode,
  isMaximized,
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

  const readResetTopHeight = useCallback(() => {
    const contentHeight = getEditorContentHeight()
    return contentHeight != null
      ? clampPaneHeight(MIN_EDITOR_HEIGHT, contentHeight)
      : topHeightForSql(cell.value)
  }, [cell.value, getEditorContentHeight])

  const signalAgentVisibleHeightChange = useCallback(
    (patch: Partial<NotebookCell>) => {
      if (hasAgentVisibleCellHeightChanged(cell, patch, layoutMode)) {
        signalUserEdit(bufferIdForEvents)
      }
    },
    [bufferIdForEvents, cell, layoutMode],
  )

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
      updateCell(cell.id, {
        topHeight: readResetTopHeight(),
        topResized: false,
      })
    }, [cell.id, readResetTopHeight, updateCell]),
  )
  const bottomResize = useCellResize(
    minBottomHeightFor(cell),
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

  const { topHeight, bottomHeight } = computeCellHeights(cell, {
    liveTopHeight: topResize.liveHeight,
    liveBottomHeight: bottomResize.liveHeight,
    expectingResult,
  })

  const spotlightEditorRatio =
    spotlightLiveRatio ??
    cell.spotlightEditorRatio ??
    topHeight / (topHeight + bottomHeight)

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

  const commitEditorHeight = (height: number) => {
    const patch = {
      topHeight: clampPaneHeight(MIN_EDITOR_HEIGHT, height),
      topResized: true,
    }
    signalAgentVisibleHeightChange(patch)
    updateCell(cell.id, patch)
  }

  const splitResizeLive = (height: number) => {
    if (isMaximized) {
      setSpotlightLiveRatio(spotlightRatioFor(height))
      return
    }
    commitEditorHeight(height)
  }

  const splitResizeEnd = (height: number) => {
    if (isMaximized) {
      setSpotlightLiveRatio(null)
      updateCell(cell.id, { spotlightEditorRatio: spotlightRatioFor(height) })
      return
    }
    commitEditorHeight(height)
  }

  const resetSplit = () => {
    if (isMaximized) {
      setSpotlightLiveRatio(null)
      updateCell(cell.id, { spotlightEditorRatio: undefined })
      return
    }
    signalAgentVisibleHeightChange({
      topHeight: readResetTopHeight(),
      topResized: false,
    })
    topResize.resetHeight()
  }

  const resetBottomArea = useCallback(() => {
    if (isMaximized) {
      setSpotlightLiveRatio(null)
      updateCell(cell.id, { spotlightEditorRatio: undefined })
      return
    }
    if (showBottomSlot) {
      signalAgentVisibleHeightChange({
        bottomHeight: undefined,
        bottomResized: false,
      })
      bottomResize.resetHeight()
    } else {
      signalAgentVisibleHeightChange({
        topHeight: readResetTopHeight(),
        topResized: false,
      })
      topResize.resetHeight()
    }
  }, [
    isMaximized,
    showBottomSlot,
    bottomResize,
    topResize,
    cell.id,
    readResetTopHeight,
    signalAgentVisibleHeightChange,
    updateCell,
  ])

  useEffect(() => {
    const handler = (payload?: { cellId?: string }) => {
      if (payload?.cellId !== cell.id) return
      resetBottomArea()
    }
    eventBus.subscribe(EventType.NOTEBOOK_CELL_RESET_SIZE, handler)
    return () =>
      eventBus.unsubscribe(EventType.NOTEBOOK_CELL_RESET_SIZE, handler)
  }, [cell.id, resetBottomArea])

  return {
    topHeight,
    bottomHeight,
    spotlightEditorRatio,
    topResize,
    bottomResize,
    splitResizeLive,
    splitResizeEnd,
    resetSplit,
    resetBottomArea,
  }
}
