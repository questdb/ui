import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { signalUserEdit } from "../../../../utils/notebooks/notebookAIBridge"
import { useNotebookActions, useNotebookBufferId } from "../NotebookProvider"
import { resetChartZoom } from "../cellVirtualization/chartZoomStore"
import type { CellView } from "../notebookUtils"
import type { CellPaneLayout } from "../cellSizing"

type CellViewActionMethod = "menu" | "toggle" | "button"

type Params = {
  cellId: string
  view: CellView
  paneLayout: CellPaneLayout
  isCellBusy: boolean
  method: CellViewActionMethod
}

export const useCellViewActions = ({
  cellId,
  view,
  paneLayout,
  isCellBusy,
  method,
}: Params) => {
  const { setCellPaneView, setCellMode, clearCellResult } = useNotebookActions()
  const bufferId = useNotebookBufferId()
  const resultOnly = paneLayout === "result"

  // Table and Chart only switch the view: choosing the one already shown
  // does nothing. Closing the results is closeResults.
  const viewTable = () => {
    if (isCellBusy || view === "grid") return
    if (view === "none") {
      signalUserEdit(bufferId)
      eventBus.publish(EventType.NOTEBOOK_CELL_RUN, { cellId })
      return
    }

    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_VIEW_CHANGE, {
      to: "grid",
      method,
    })
    signalUserEdit(bufferId)
    setCellMode(cellId, "run")
  }

  const viewChart = () => {
    if (isCellBusy || view === "chart") return
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_VIEW_CHANGE, {
      to: "chart",
      method,
    })
    signalUserEdit(bufferId)
    eventBus.publish(EventType.NOTEBOOK_CELL_DRAW, { cellId })
  }

  // Drops the rows and the stored result, so the cell shows its editor only.
  // A chart goes through the draw toggle, which also leaves chart mode.
  // Returns whether the results closed.
  const closeResults = (): boolean => {
    if (isCellBusy || view === "none") return false
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_VIEW_CHANGE, {
      to: "none",
      method,
    })
    signalUserEdit(bufferId)
    if (view === "chart") {
      eventBus.publish(EventType.NOTEBOOK_CELL_DRAW, { cellId })
    } else {
      clearCellResult(cellId)
    }
    return true
  }

  const toggleEditor = () => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_EDITOR_TOGGLE, {
      editorShown: resultOnly,
      view,
    })
    signalUserEdit(bufferId)
    setCellPaneView(cellId, resultOnly ? "editor_result" : "result")
  }

  const resetZoom = () => resetChartZoom(cellId)

  return { viewTable, viewChart, closeResults, toggleEditor, resetZoom }
}
