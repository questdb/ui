import React from "react"
import styled from "styled-components"
import { FileSqlIcon, TableIcon } from "@phosphor-icons/react"
import { Reset } from "../../../../components/icons"
import { Spinner } from "./Spinner"
import { ChartIcon } from "./ChartIcon"
import {
  IconButton,
  PrimaryToggleButton,
  Tooltip,
} from "../../../../components"
import {
  NotebookViewToggle,
  NotebookViewToggleSegment,
} from "../NotebookViewToggle"
import { useNotebookActions, useNotebookBufferId } from "../NotebookProvider"
import { signalUserEdit } from "../../../../utils/notebooks/notebookAIBridge"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import { clearChartZoom } from "../cellVirtualization/chartZoomStore"
import type { CellPaneLayout, CellView } from "../notebookUtils"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"

const DimSpinner = styled(Spinner)`
  opacity: 0.5;
`

const ViewActions = styled.div`
  display: inline-flex;
  align-items: center;
`

// Reset remains a compact auxiliary action beside the view controls.
const ViewIconButton = styled(IconButton)`
  width: 4rem;
  min-width: 4rem;
  height: 3rem;
  min-height: 3rem;

  svg {
    width: 1.8rem;
    height: 1.8rem;
  }
`

const Divider = styled.div`
  width: 1px;
  align-self: stretch;
  margin: 0.3rem 0.6rem;
  background: ${({ theme }) => theme.color.interactionNeutral};
`

// Match the schema toolbar's auto-refresh toggle dimensions and interaction,
// but keep editor visibility neutral rather than giving it an accent state.
const EditorVisibilityToggle = styled(PrimaryToggleButton)`
  &&:not(:disabled) {
    width: auto;
    padding: 0 1rem;
    height: 3rem;
    min-height: 3rem;
    color: ${({ theme }) => theme.color.contentSecondary};
  }

  &&[data-selected="true"],
  &&[data-selected="true"]:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.interactionNeutral};
    color: ${({ theme }) => theme.color.contentPrimary};
  }
`

type Props = {
  cellId: string
  view: CellView
  paneLayout: CellPaneLayout
  isGridLoading: boolean
  isChartLoading: boolean
  isRunning: boolean
  chartZoomed: boolean
  showLabels: boolean
}

export const CellViewToggle: React.FC<Props> = ({
  cellId,
  view,
  paneLayout,
  isGridLoading,
  isChartLoading,
  isRunning,
  chartZoomed,
  showLabels,
}) => {
  const { setCellPaneView, setCellMode, clearCellResult } = useNotebookActions()
  const bufferId = useNotebookBufferId()
  const resultOnly = paneLayout === "result"
  const resultHidden = paneLayout === "editor"

  // Clicking the active segment toggles it off, wiping the result back to the
  // empty "none" state. Switching between grid and chart re-renders the same
  // cell.result instead of re-querying: NOTEBOOK_CELL_DRAW enters draw, where
  // the chart settles on cell.result; switching to the table just flips the
  // mode back, where the grid shows the chart's last frame.
  const handleChart = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isRunning) return
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_VIEW_CHANGE, {
      to: view === "chart" ? "none" : "chart",
      method: "toggle",
    })
    signalUserEdit(bufferId)
    eventBus.publish(EventType.NOTEBOOK_CELL_DRAW, { cellId })
  }
  const handleTable = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isRunning) return
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_VIEW_CHANGE, {
      to: view === "grid" ? "none" : "grid",
      method: "toggle",
    })
    signalUserEdit(bufferId)
    if (view === "grid") {
      clearCellResult(cellId)
      return
    }
    setCellMode(cellId, "run")
    if (resultHidden) setCellPaneView(cellId, "editor_result")
  }
  const handleEditorVisibility = (e: React.MouseEvent) => {
    e.stopPropagation()
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_EDITOR_TOGGLE, {
      editorShown: resultOnly,
      view,
    })
    signalUserEdit(bufferId)
    setCellPaneView(cellId, resultOnly ? "editor_result" : "result")
  }
  const handleResetZoom = (e: React.MouseEvent) => {
    e.stopPropagation()
    clearChartZoom(cellId)
    eventBus.publish(EventType.NOTEBOOK_CELL_RESET_ZOOM, { cellId })
  }

  return (
    <ViewActions>
      <NotebookViewToggle role="group" aria-label="Cell result view">
        <Tooltip content="Table">
          <NotebookViewToggleSegment
            type="button"
            $size="md"
            $active={view === "grid"}
            $activeTone="neutral"
            aria-pressed={view === "grid"}
            aria-busy={view === "grid" && isGridLoading}
            disabled={isRunning}
            onClick={handleTable}
            aria-label="View table"
          >
            {view === "grid" && isGridLoading ? (
              <DimSpinner size={18} />
            ) : (
              <TableIcon />
            )}
            {showLabels && "Table"}
          </NotebookViewToggleSegment>
        </Tooltip>
        <Tooltip content="Chart">
          <NotebookViewToggleSegment
            type="button"
            $size="md"
            $active={view === "chart"}
            $activeTone="neutral"
            aria-pressed={view === "chart"}
            aria-busy={view === "chart" && isChartLoading}
            disabled={isRunning}
            onClick={handleChart}
            aria-label="View chart"
          >
            {view === "chart" && isChartLoading ? (
              <DimSpinner size={18} />
            ) : (
              <ChartIcon />
            )}
            {showLabels && "Chart"}
          </NotebookViewToggleSegment>
        </Tooltip>
      </NotebookViewToggle>
      <Divider />
      <Tooltip content={resultOnly ? "Show editor" : "Hide editor"}>
        <EditorVisibilityToggle
          aria-label={resultOnly ? "Show editor" : "Hide editor"}
          onClick={handleEditorVisibility}
          selected={!resultOnly}
        >
          <FileSqlIcon size={18} />
        </EditorVisibilityToggle>
      </Tooltip>
      {view === "chart" && chartZoomed && (
        <Tooltip content="Reset zoom">
          <ViewIconButton label="Reset zoom" onClick={handleResetZoom}>
            <Reset />
          </ViewIconButton>
        </Tooltip>
      )}
    </ViewActions>
  )
}
