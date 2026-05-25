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
const Bar = styled.div<{ $maximized: boolean }>`
  position: absolute;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  background: ${({ theme }) => theme.color.backgroundDarker};

  ${({ $maximized, theme }) =>
    $maximized
      ? `
        top: 0;
        left: 0;
        right: 0;
        min-height: 3.4rem;
        padding: 0.5rem 1rem;
        justify-content: space-between;
        cursor: grab;

        &:active {
          cursor: grabbing;
        }
      `
      : `
        top: 0;
        left: 0;
        padding: 0.3rem 0.6rem;
        border: 1px solid ${theme.color.selection};
        border-radius: 0.6rem;
      `}
`

const ToggleGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
`

const Cluster = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
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
  <Bar
    data-hook="chart-actions"
    $maximized={isMaximized}
    className={isMaximized ? "cell-drag-handle" : undefined}
  >
    <Cluster>
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
    </Cluster>
    <Cluster>
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
    </Cluster>
  </Bar>
)
