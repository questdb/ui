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
import type { CellPaneLayout, CellView } from "../notebookUtils"
import { useCellViewActions } from "./useCellViewActions"

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

// Match the schema toolbar's auto-refresh toggle dimensions and interaction.
// The pressed state wears the same glass lens as the active segments and
// tabs (SegmentedControl's GlassSelection), so one cue marks every active
// control in the header. The transparent border reserves the lens's box so
// toggling never shifts layout.
const EditorVisibilityToggle = styled(PrimaryToggleButton)`
  &&:not(:disabled) {
    width: auto;
    padding: 0 1rem;
    height: 3rem;
    min-height: 3rem;
    color: ${({ theme }) => theme.color.contentSecondary};
    border: 1px solid ${({ theme }) => theme.color.transparent};
    border-bottom-width: 2px;
    border-radius: 0.4rem;
  }

  &&[data-selected="true"],
  &&[data-selected="true"]:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.glassSurface};
    color: ${({ theme }) => theme.color.contentPrimary};
    border-color: ${({ theme }) => theme.color.glassBorder};
    border-bottom-color: ${({ theme }) => theme.color.glassEdge};
    box-shadow: 0 3px 9px ${({ theme }) => theme.color.shadowSoft};
    backdrop-filter: blur(6px) saturate(145%);
    -webkit-backdrop-filter: blur(5px) saturate(150%);
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
  onResetZoomFocus?: () => void
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
  onResetZoomFocus,
}) => {
  const resultOnly = paneLayout === "result"
  const { viewTable, viewChart, toggleEditor, resetZoom } = useCellViewActions({
    cellId,
    view,
    paneLayout,
    isRunning,
    method: "toggle",
  })

  // Clicking the active segment toggles it off, wiping the result back to the
  // empty "none" state. Switching between grid and chart re-renders the same
  // cell.result instead of re-querying: NOTEBOOK_CELL_DRAW enters draw, where
  // the chart settles on cell.result; switching to the table just flips the
  // mode back, where the grid shows the chart's last frame.
  const handleChart = (e: React.MouseEvent) => {
    e.stopPropagation()
    viewChart()
  }
  const handleTable = (e: React.MouseEvent) => {
    e.stopPropagation()
    viewTable()
  }
  const handleEditorVisibility = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleEditor()
  }
  const handleResetZoom = (e: React.MouseEvent) => {
    e.stopPropagation()
    resetZoom()
    onResetZoomFocus?.()
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
          aria-label="Editor"
          aria-pressed={!resultOnly}
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
