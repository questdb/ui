import { useCallback, useEffect, useState } from "react"
import type { NotebookCell } from "../../../../store/notebook"
import { useNotebookActions, useNotebookBufferId } from "../NotebookProvider"
import { useCellResize } from "./useCellResize"
import { signalUserEdit } from "../../../../utils/notebooks/notebookAIBridge"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import {
  computeCellHeights,
  hasAgentVisibleCellHeightChanged,
  MIN_BOTTOM_HEIGHT_PX,
  partitionCellHeights,
  scaleCellHeights,
  topHeightForSql,
} from "../notebookUtils"

// Minimum content area heights. `MIN_EDITOR_HEIGHT` matches Monaco's reported
// content height for an empty editor (one line + padding); the previous
// `MAX_EDITOR_HEIGHT` cap is gone — the editor now auto-grows freely with
// pasted content (user-confirmed: unbounded).
export const MIN_EDITOR_HEIGHT = 72

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

// Every way a cell's editor / result split can be resized — the inner split
// handle, the bottom-edge handle, the maximized-chart handle, the spotlight
// ratio, and their double-click resets — plus the derived top/bottom heights
// the layout renders from.
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
      ? Math.max(MIN_EDITOR_HEIGHT, contentHeight)
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

  const { topHeight, bottomHeight } = computeCellHeights(cell, {
    liveTopHeight: topResize.liveHeight,
    liveBottomHeight: bottomResize.liveHeight,
    expectingResult,
  })

  const spotlightEditorRatio =
    spotlightLiveRatio ??
    cell.spotlightEditorRatio ??
    topHeight / (topHeight + bottomHeight)

  const middleSum = () => {
    if (!isMaximized) return topHeight + bottomHeight
    const editorH =
      editorContainerRef.current?.getBoundingClientRect().height ?? 0
    const bottomH = resultRef.current?.getBoundingClientRect().height ?? 0
    return editorH + bottomH
  }

  const middleResizeLive = (height: number) => {
    const { top, bottom } = partitionCellHeights(
      middleSum(),
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
  }

  const middleResizeEnd = (height: number) => {
    const { top, bottom } = partitionCellHeights(
      middleSum(),
      height,
      MIN_EDITOR_HEIGHT,
      MIN_BOTTOM_HEIGHT_PX,
    )
    if (isMaximized) {
      setSpotlightLiveRatio(null)
      updateCell(cell.id, { spotlightEditorRatio: top / (top + bottom) })
      return
    }
    signalAgentVisibleHeightChange({
      topHeight: top,
      topResized: true,
      bottomHeight: bottom,
      bottomResized: true,
    })
    topResize.resizeEnd(top)
    bottomResize.resizeEnd(bottom)
  }

  const resetToDefaults = () => {
    if (isMaximized) {
      setSpotlightLiveRatio(null)
      updateCell(cell.id, { spotlightEditorRatio: undefined })
      return
    }
    signalAgentVisibleHeightChange({
      topHeight: readResetTopHeight(),
      topResized: false,
      bottomHeight: undefined,
      bottomResized: false,
    })
    bottomResize.resetHeight()
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

  // When a chart is maximized the BottomSlot fills the whole cell, so its
  // measured height IS the cell total — scale top/bottom to that new total
  // (preserving the split so it's intact when the chart is restored).
  const maximizedChartResizeLive = (newTotalHeight: number) => {
    const { top, bottom } = scaleCellHeights(
      topHeight,
      bottomHeight,
      newTotalHeight,
      MIN_EDITOR_HEIGHT,
      MIN_BOTTOM_HEIGHT_PX,
    )
    topResize.resizeLive(top)
    bottomResize.resizeLive(bottom)
  }

  const maximizedChartResizeEnd = (newTotalHeight: number) => {
    const { top, bottom } = scaleCellHeights(
      topHeight,
      bottomHeight,
      newTotalHeight,
      MIN_EDITOR_HEIGHT,
      MIN_BOTTOM_HEIGHT_PX,
    )
    topResize.resizeEnd(top)
    bottomResize.resizeEnd(bottom)
  }

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
    middleResizeLive,
    middleResizeEnd,
    resetToDefaults,
    resetBottomArea,
    maximizedChartResizeLive,
    maximizedChartResizeEnd,
  }
}
