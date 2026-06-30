import React from "react"
import styled from "styled-components"
import {
  TableIcon,
  ArrowsOutLineVerticalIcon,
  ArrowsInLineVerticalIcon,
} from "@phosphor-icons/react"
import { Reset } from "@styled-icons/boxicons-regular"
import { Spinner } from "./Spinner"
import { ChartIcon } from "./ChartIcon"
import { Tooltip } from "../../../../components"
import { useNotebookActions } from "../NotebookProvider"
import { signalUserEdit } from "../../../../utils/notebookAIBridge"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import type { CellView } from "../notebookUtils"

const Container = styled.div`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem;
  border-radius: 0.6rem;
  background: ${({ theme }) => theme.color.backgroundLighter};
  border: 1px solid ${({ theme }) => `${theme.color.selection}80`};
`

const DimSpinner = styled(Spinner)`
  opacity: 0.5;
`

const Segment = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 3rem;
  padding: 0 0.8rem;
  border: none;
  border-radius: 0.4rem;
  background: ${({ $active, theme }) =>
    $active ? theme.color.selection : "transparent"};
  color: ${({ theme }) => theme.color.foreground};
  font-size: 1.4rem;
  cursor: pointer;

  svg {
    width: 1.8rem;
    height: 1.8rem;
  }

  &:hover {
    background: ${({ $active, theme }) =>
      $active ? theme.color.selection : `${theme.color.selection}80`};
  }
`

const Divider = styled.div`
  width: 1px;
  align-self: stretch;
  margin: 0.2rem 0;
  background: ${({ theme }) => theme.color.selection};
`

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 3rem;
  padding: 0 1.1rem;
  border: none;
  border-radius: 0.4rem;
  background: transparent;
  color: ${({ theme }) => theme.color.foreground};
  cursor: pointer;

  svg {
    width: 1.8rem;
    height: 1.8rem;
  }

  &:hover {
    background: ${({ theme }) => `${theme.color.selection}80`};
  }
`

type Props = {
  cellId: string
  view: CellView
  isViewMaximized: boolean
  isGridLoading: boolean
  isChartLoading: boolean
  chartZoomed: boolean
  showLabels: boolean
}

export const CellViewToggle: React.FC<Props> = ({
  cellId,
  view,
  isViewMaximized,
  isGridLoading,
  isChartLoading,
  chartZoomed,
  showLabels,
}) => {
  const { setCellViewMaximized, setCellMode, clearCellResult } =
    useNotebookActions()

  // Clicking the active segment toggles it off, wiping the result back to the
  // empty "none" state. Switching between grid and chart transfers the existing
  // data to the other representation instead of re-querying: NOTEBOOK_CELL_DRAW
  // enters draw, where the chart seeds from cell.result; switching to the table
  // just flips the mode back, where the grid shows the chart's mirrored result.
  const handleChart = (e: React.MouseEvent) => {
    e.stopPropagation()
    signalUserEdit()
    eventBus.publish(EventType.NOTEBOOK_CELL_DRAW, { cellId })
  }
  const handleTable = (e: React.MouseEvent) => {
    e.stopPropagation()
    signalUserEdit()
    if (view === "grid") {
      clearCellResult(cellId)
      return
    }
    setCellMode(cellId, "run")
  }
  const handleSplit = (e: React.MouseEvent) => {
    e.stopPropagation()
    signalUserEdit()
    setCellViewMaximized(cellId, !isViewMaximized)
  }
  const handleResetZoom = (e: React.MouseEvent) => {
    e.stopPropagation()
    eventBus.publish(EventType.NOTEBOOK_CELL_RESET_ZOOM, { cellId })
  }

  return (
    <Container>
      <Tooltip content="Table">
        <Segment
          type="button"
          $active={view === "grid"}
          aria-pressed={view === "grid"}
          aria-busy={view === "grid" && isGridLoading}
          onClick={handleTable}
          aria-label="View table"
        >
          {view === "grid" && isGridLoading ? (
            <DimSpinner size={18} />
          ) : (
            <TableIcon />
          )}
          {showLabels && "Table"}
        </Segment>
      </Tooltip>
      <Tooltip content="Chart">
        <Segment
          type="button"
          $active={view === "chart"}
          aria-pressed={view === "chart"}
          aria-busy={view === "chart" && isChartLoading}
          onClick={handleChart}
          aria-label="View chart"
        >
          {view === "chart" && isChartLoading ? (
            <DimSpinner size={18} />
          ) : (
            <ChartIcon />
          )}
          {showLabels && "Chart"}
        </Segment>
      </Tooltip>
      <Divider />
      <Tooltip content={isViewMaximized ? "Split view" : "Maximize view"}>
        <IconButton
          type="button"
          onClick={handleSplit}
          aria-label={isViewMaximized ? "Split view" : "Maximize view"}
        >
          {isViewMaximized ? (
            <ArrowsInLineVerticalIcon />
          ) : (
            <ArrowsOutLineVerticalIcon />
          )}
        </IconButton>
      </Tooltip>
      {view === "chart" && chartZoomed && (
        <Tooltip content="Reset zoom">
          <IconButton
            type="button"
            onClick={handleResetZoom}
            aria-label="Reset zoom"
          >
            <Reset />
          </IconButton>
        </Tooltip>
      )}
    </Container>
  )
}
