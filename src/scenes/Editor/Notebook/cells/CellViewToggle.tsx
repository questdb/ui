import React from "react"
import styled from "styled-components"
import {
  TableIcon,
  ArrowsOutLineVerticalIcon,
  ArrowsInLineVerticalIcon,
} from "@phosphor-icons/react"
import { Reset } from "../../../../components/icons"
import { Spinner } from "./Spinner"
import { ChartIcon } from "./ChartIcon"
import { IconButton, Tooltip } from "../../../../components"
import {
  NotebookViewToggle,
  NotebookViewToggleSegment,
} from "../NotebookViewToggle"
import { useNotebookActions, useNotebookBufferId } from "../NotebookProvider"
import { signalUserEdit } from "../../../../utils/notebooks/notebookAIBridge"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import { clearChartZoom } from "../cellVirtualization/chartZoomStore"
import type { CellView } from "../notebookUtils"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"

const DimSpinner = styled(Spinner)`
  opacity: 0.5;
`

// This control predates the general 3.4rem icon-button size and sits beside
// the cell toolbar in a tightly constrained header. Preserve its original
// 3rem height so the two control groups retain their vertical separation.
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
  margin: 0.2rem 0;
  background: ${({ theme }) => theme.color.interactionNeutral};
`

type Props = {
  cellId: string
  view: CellView
  isViewMaximized: boolean
  isGridLoading: boolean
  isChartLoading: boolean
  isRunning: boolean
  chartZoomed: boolean
  showLabels: boolean
}

export const CellViewToggle: React.FC<Props> = ({
  cellId,
  view,
  isViewMaximized,
  isGridLoading,
  isChartLoading,
  isRunning,
  chartZoomed,
  showLabels,
}) => {
  const { setCellViewMaximized, setCellMode, clearCellResult } =
    useNotebookActions()
  const bufferId = useNotebookBufferId()

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
  }
  const handleSplit = (e: React.MouseEvent) => {
    e.stopPropagation()
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_VIEW_MAXIMIZE, {
      isViewMaximized: !isViewMaximized,
      view,
    })
    signalUserEdit(bufferId)
    setCellViewMaximized(cellId, !isViewMaximized)
  }
  const handleResetZoom = (e: React.MouseEvent) => {
    e.stopPropagation()
    clearChartZoom(cellId)
    eventBus.publish(EventType.NOTEBOOK_CELL_RESET_ZOOM, { cellId })
  }

  return (
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
      <Divider />
      <Tooltip content={isViewMaximized ? "Split view" : "Maximize view"}>
        <ViewIconButton
          label={isViewMaximized ? "Split view" : "Maximize view"}
          onClick={handleSplit}
        >
          {isViewMaximized ? (
            <ArrowsInLineVerticalIcon />
          ) : (
            <ArrowsOutLineVerticalIcon />
          )}
        </ViewIconButton>
      </Tooltip>
      {view === "chart" && chartZoomed && (
        <Tooltip content="Reset zoom">
          <ViewIconButton label="Reset zoom" onClick={handleResetZoom}>
            <Reset />
          </ViewIconButton>
        </Tooltip>
      )}
    </NotebookViewToggle>
  )
}
