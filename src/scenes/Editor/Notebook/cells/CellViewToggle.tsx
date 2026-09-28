import React from "react"
import styled from "styled-components"
import { FileSqlIcon, TableIcon } from "@phosphor-icons/react"
import { Reset } from "../../../../components/icons"
import { ChartIcon } from "./ChartIcon"
import { IconButton, Spinner, Tooltip } from "../../../../components"
import { glassLens } from "../../../../components/SegmentedControl"
import {
  NotebookViewToggle,
  NotebookViewToggleSegment,
} from "../NotebookViewToggle"
import type { CellView } from "../notebookUtils"
import type { CellPaneLayout } from "../cellSizing"
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

  &&:hover:not(:disabled):not([aria-disabled="true"]) {
    background: ${({ theme }) =>
      theme.mode === "light"
        ? theme.color.interactionHover
        : theme.color.surfaceRaised};
  }
`

const Divider = styled.div`
  width: 1px;
  align-self: stretch;
  margin: 0.3rem 0.6rem;
  background: ${({ theme }) => theme.color.interactionNeutral};
`

const EditorVisibilityToggle = styled(NotebookViewToggleSegment)`
  && {
    border: 1px solid ${({ theme }) => theme.color.transparent};
    border-bottom-width: 2px;
  }

  &&[aria-pressed="true"],
  &&[aria-pressed="true"]:hover:not(:disabled) {
    ${glassLens}
  }
`

type Props = {
  cellId: string
  view: CellView
  paneLayout: CellPaneLayout
  isGridLoading: boolean
  isChartLoading: boolean
  isCellBusy: boolean
  chartZoomed: boolean
  showLabels: boolean
  onResetZoomFocus: () => void
}

export const CellViewToggle: React.FC<Props> = ({
  cellId,
  view,
  paneLayout,
  isGridLoading,
  isChartLoading,
  isCellBusy,
  chartZoomed,
  showLabels,
  onResetZoomFocus,
}) => {
  const resultOnly = paneLayout === "result"
  const { viewTable, viewChart, toggleEditor, resetZoom } = useCellViewActions({
    cellId,
    view,
    paneLayout,
    isCellBusy,
    method: "toggle",
  })

  // Clicking the active segment toggles it off, wiping the result back to the
  // empty "none" state. Switching between grid and chart re-renders the same
  // cell.result instead of re-querying: NOTEBOOK_CELL_DRAW enters draw, where
  // the chart settles on cell.result; switching to the table just flips the
  // mode back, where the grid shows the chart's last frame.
  // A busy segment is locked with aria-disabled, not disabled: a native
  // disabled control drops keyboard focus to the document body.
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
  // Focus moves on only after a keyboard activation: a mouse click that
  // landed focus on the toolbar would open its first tooltip.
  const handleResetZoom = (e: React.MouseEvent) => {
    e.stopPropagation()
    resetZoom()
    if (e.detail === 0) onResetZoomFocus()
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
            aria-disabled={isCellBusy}
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
            aria-disabled={isCellBusy}
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
          type="button"
          $size="md"
          $active={!resultOnly}
          $activeTone="neutral"
          onClick={handleEditorVisibility}
          aria-label="Editor"
        >
          <FileSqlIcon />
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
