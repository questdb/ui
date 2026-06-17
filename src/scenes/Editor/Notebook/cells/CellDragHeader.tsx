import React from "react"
import styled from "styled-components"
import { CellToolbar } from "./CellToolbar"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"

// The cell's top bar: it is the grid drag handle (`cell-drag-handle`), the
// double-click-to-expand-width target, and the mount point for CellToolbar.
// Shared by SQL cells (RunBar) and markdown cells so the drag/expand/toolbar
// contract the grid relies on lives in one place.
const HeaderBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
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

// The right cluster holds the toolbar buttons (and a markdown cell's Apply/Edit
// button), which already self-space via their own padding — no extra gap, so
// every button in the cluster sits the same distance apart.
const RightSide = styled(Side)`
  gap: 0;
`

type Props = {
  cellId: string
  layoutMode: "list" | "grid"
  left?: React.ReactNode
  right?: React.ReactNode
}

export const CellDragHeader: React.FC<Props> = ({
  cellId,
  layoutMode,
  left,
  right,
}) => (
  <HeaderBar
    className="cell-drag-handle"
    onDoubleClick={(e) => {
      if (layoutMode !== "grid") return
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
    <Side>{left}</Side>
    <RightSide>
      {right}
      <CellToolbar cellId={cellId} inline />
    </RightSide>
  </HeaderBar>
)
