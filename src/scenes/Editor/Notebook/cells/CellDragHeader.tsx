import React, { type RefObject } from "react"
import styled from "styled-components"
import { CellToolbar } from "./CellToolbar"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import type { CellToolbarTier } from "../notebookUtils"
import type { NotebookCell } from "../../../../store/notebook"

// The cell's top bar: it is the grid drag handle (`cell-drag-handle`), the
// double-click-to-expand-width target, and the mount point for CellToolbar.
// Shared by SQL cells (RunBar) and markdown cells so the drag/expand/toolbar
// contract the grid relies on lives in one place.
// Fixed height: the right-slot content swaps between the neutral Run/Draw
// toggles and the view toggle (e.g. when a result hydrates or releases), and
// a content-driven height would shift the whole cell's geometry on every
// swap. CELL_BASE_CHROME_PX builds on this 42px.
const HeaderBar = styled.div`
  height: 4.2rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  background: ${({ theme }) => theme.color.backgroundDarker};
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
`

const Side = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`

// Takes the slack and is the only cluster allowed to shrink — min-width:0 lets
// its CellNameLabel ellipsize so a long name never pushes the toolbar.
const LeftSide = styled(Side)`
  flex: 1;
  min-width: 0;
  padding-right: 1.5rem;
`

// The right cluster holds the Run/Draw toggles, the toolbar (maximize + more
// options), and a markdown cell's Apply/Edit button. A small gap evenly spaces
// them; flex-shrink:0 keeps the cluster intact within the cell width while the
// name on the left shrinks first.
const RightSide = styled(Side)`
  gap: 0.5rem;
  flex-shrink: 0;
`

type Props = {
  cellId: string
  cell: NotebookCell
  cellIndex: number
  totalCells: number
  layoutMode: "list" | "grid"
  isMaximized: boolean
  isRunning?: boolean
  left?: React.ReactNode
  right?: React.ReactNode
  // SQL cells pass this so the toolbar can adapt to the header's width; markdown
  // cells omit it (no width-driven tiering).
  headerRef?: RefObject<HTMLDivElement>
  toolbarTier?: CellToolbarTier
  chartZoomed?: boolean
}

export const CellDragHeader: React.FC<Props> = ({
  cellId,
  cell,
  cellIndex,
  totalCells,
  layoutMode,
  isMaximized,
  isRunning = false,
  left,
  right,
  headerRef,
  toolbarTier,
  chartZoomed,
}) => (
  <HeaderBar
    ref={headerRef}
    className="cell-drag-handle"
    onDoubleClick={(e) => {
      if (isMaximized || layoutMode !== "grid") return
      if (
        (e.target as HTMLElement).closest(
          "button, a, input, select, textarea, .cell-toolbar",
        )
      )
        return
      eventBus.publish(EventType.NOTEBOOK_CELL_EXPAND_WIDTH, {
        cellId,
        kind: "full",
      })
    }}
  >
    <LeftSide>{left}</LeftSide>
    <RightSide>
      {right}
      <CellToolbar
        cellId={cellId}
        cell={cell}
        cellIndex={cellIndex}
        totalCells={totalCells}
        layoutMode={layoutMode}
        isMaximized={isMaximized}
        isRunning={isRunning}
        inline
        toolbarTier={toolbarTier}
        chartZoomed={chartZoomed}
      />
    </RightSide>
  </HeaderBar>
)
