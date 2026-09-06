import { useCallback } from "react"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { signalUserEdit } from "../../../../utils/notebooks/notebookAIBridge"
import { useNotebookActions, useNotebookBufferId } from "../NotebookProvider"
import { clearChartZoom } from "../cellVirtualization/chartZoomStore"
import type { CellPaneLayout, CellView } from "../notebookUtils"

type CellViewActionMethod = "menu" | "toggle"

type Params = {
  cellId: string
  view: CellView
  paneLayout: CellPaneLayout
  isRunning: boolean
  method: CellViewActionMethod
}

export const useCellViewActions = ({
  cellId,
  view,
  paneLayout,
  isRunning,
  method,
}: Params) => {
  const { setCellPaneView, setCellMode, clearCellResult } = useNotebookActions()
  const bufferId = useNotebookBufferId()
  const resultOnly = paneLayout === "result"

  const viewTable = useCallback(() => {
    if (isRunning) return
    if (view === "none") {
      signalUserEdit(bufferId)
      eventBus.publish(EventType.NOTEBOOK_CELL_RUN, { cellId })
      return
    }

    // Preserve the existing observable order on both surfaces: the compact
    // menu signalled first, while the segmented toggle tracked first.
    if (method === "menu") signalUserEdit(bufferId)
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_VIEW_CHANGE, {
      to: view === "grid" ? "none" : "grid",
      method,
    })
    if (method === "toggle") signalUserEdit(bufferId)

    if (view === "grid") clearCellResult(cellId)
    else setCellMode(cellId, "run")
  }, [bufferId, cellId, clearCellResult, isRunning, method, setCellMode, view])

  const viewChart = useCallback(() => {
    if (isRunning) return
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_VIEW_CHANGE, {
      to: view === "chart" ? "none" : "chart",
      method,
    })
    signalUserEdit(bufferId)
    eventBus.publish(EventType.NOTEBOOK_CELL_DRAW, { cellId })
  }, [bufferId, cellId, isRunning, method, view])

  const toggleEditor = useCallback(() => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_EDITOR_TOGGLE, {
      editorShown: resultOnly,
      view,
    })
    signalUserEdit(bufferId)
    setCellPaneView(cellId, resultOnly ? "editor_result" : "result")
  }, [bufferId, cellId, resultOnly, setCellPaneView, view])

  const resetZoom = useCallback(() => {
    clearChartZoom(cellId)
    eventBus.publish(EventType.NOTEBOOK_CELL_RESET_ZOOM, { cellId })
  }, [cellId])

  return { viewTable, viewChart, toggleEditor, resetZoom }
}
