import React from "react"
import styled from "styled-components"
import {
  ArrowClockwiseIcon,
  ArrowsInLineVerticalIcon,
  ArrowsOutLineVerticalIcon,
  GearIcon,
} from "@phosphor-icons/react"
import { Reset } from "@styled-icons/boxicons-regular"
import { Button } from "../../../../components"
import { Switch } from "../../../../components/Switch"
import { CellToolbar } from "../cells/CellToolbar"

// Chart maximize uses ArrowsOutLineVertical/ArrowsInLineVertical (maximize INTO the cell)
// to stay visually distinct from the cell's CornersOut/CornersIn (maximize INTO the buffer).
const Bar = styled.div`
  position: absolute;
  top: 0.6rem;
  right: 0.8rem;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.3rem 0.6rem;
  background: ${({ theme }) => theme.color.backgroundDarker};
  border: 1px solid ${({ theme }) => theme.color.selection};
  border-radius: 0.6rem;
`

const ToggleGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
`

const ToggleLabel = styled.span`
  font-size: 1.1rem;
  color: ${({ theme }) => theme.color.gray2};
  user-select: none;
`

const ResetIcon = styled(Reset)`
  width: 1.8rem;
  height: 1.8rem;
`

type Props = {
  autoRefresh: boolean
  onAutoRefreshChange: (value: boolean) => void
  onManualRefresh: () => void
  isMaximized: boolean
  onMaximizedChange: (maximized: boolean) => void
  onOpenSettings: () => void
  canResetZoom?: boolean
  onResetZoom?: () => void
  cellId?: string
}

export const ChartActions: React.FC<Props> = ({
  autoRefresh,
  onAutoRefreshChange,
  onManualRefresh,
  isMaximized,
  onMaximizedChange,
  onOpenSettings,
  canResetZoom,
  onResetZoom,
  cellId,
}) => (
  <Bar data-hook="chart-actions">
    <ToggleGroup>
      <ToggleLabel>Auto-refresh</ToggleLabel>
      <Switch checked={autoRefresh} onChange={onAutoRefreshChange} />
    </ToggleGroup>
    {canResetZoom && onResetZoom && (
      <Button
        skin="transparent"
        type="button"
        onClick={onResetZoom}
        title="Reset zoom"
        aria-label="Reset zoom"
      >
        <ResetIcon />
      </Button>
    )}
    {!autoRefresh && (
      <Button
        skin="transparent"
        type="button"
        onClick={onManualRefresh}
        title="Refresh chart"
        aria-label="Refresh chart"
      >
        <ArrowClockwiseIcon size={18} />
      </Button>
    )}
    <Button
      skin="transparent"
      type="button"
      onClick={() => onMaximizedChange(!isMaximized)}
      title={isMaximized ? "Restore chart" : "Maximize chart"}
      aria-label={isMaximized ? "Restore chart" : "Maximize chart"}
    >
      {isMaximized ? (
        <ArrowsInLineVerticalIcon size={18} />
      ) : (
        <ArrowsOutLineVerticalIcon size={18} />
      )}
    </Button>
    <Button
      skin="transparent"
      type="button"
      onClick={onOpenSettings}
      title="Chart settings"
      aria-label="Chart settings"
    >
      <GearIcon size={18} />
    </Button>
    {isMaximized && cellId !== undefined && (
      <CellToolbar inline cellId={cellId} />
    )}
  </Bar>
)
