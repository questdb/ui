import React from "react"
import styled from "styled-components"
import {
  ArrowClockwiseIcon,
  ArrowsInLineVerticalIcon,
  ArrowsOutLineVerticalIcon,
  GearIcon,
} from "@phosphor-icons/react"
import { Reset } from "@styled-icons/boxicons-regular"
import { Button, Tooltip } from "../../../../components"
import { Switch } from "../../../../components/Switch"
import { CellToolbar } from "../cells/CellToolbar"

// Chart maximize uses ArrowsOutLineVertical/ArrowsInLineVertical (maximize INTO the cell)
// to stay visually distinct from the cell's CornersOut/CornersIn (maximize INTO the buffer).
const Bar = styled.div<{ $maximized: boolean }>`
  flex-shrink: 0;
  z-index: 2;
  height: 4rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0 1rem;
  background: ${({ theme }) => theme.color.backgroundDarker};
  border-bottom: 1px solid ${({ theme }) => theme.color.selection};

  ${({ $maximized }) =>
    $maximized &&
    `
      cursor: grab;

      &:active {
        cursor: grabbing;
      }
    `}
`

const Name = styled.span`
  min-width: 0;
  font-size: 1.6rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.foreground};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const ToggleGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
`

const Cluster = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-shrink: 0;
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
  name?: string
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
  name,
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
    <Name title={name}>{name}</Name>
    <Cluster>
      <ToggleGroup>
        <ToggleLabel>Auto-refresh</ToggleLabel>
        <Switch checked={autoRefresh} onChange={onAutoRefreshChange} />
      </ToggleGroup>
      {canResetZoom && onResetZoom && (
        <Tooltip content="Reset zoom">
          <Button
            skin="transparent"
            type="button"
            onClick={onResetZoom}
            aria-label="Reset zoom"
          >
            <ResetIcon />
          </Button>
        </Tooltip>
      )}
      {!autoRefresh && (
        <Tooltip content="Refresh chart">
          <Button
            skin="transparent"
            type="button"
            onClick={onManualRefresh}
            aria-label="Refresh chart"
          >
            <ArrowClockwiseIcon size={18} />
          </Button>
        </Tooltip>
      )}
      <Tooltip content={isMaximized ? "Restore chart" : "Maximize chart"}>
        <Button
          skin="transparent"
          type="button"
          onClick={() => onMaximizedChange(!isMaximized)}
          aria-label={isMaximized ? "Restore chart" : "Maximize chart"}
        >
          {isMaximized ? (
            <ArrowsInLineVerticalIcon size={18} />
          ) : (
            <ArrowsOutLineVerticalIcon size={18} />
          )}
        </Button>
      </Tooltip>
      <Tooltip content="Chart settings">
        <Button
          skin="transparent"
          type="button"
          onClick={onOpenSettings}
          aria-label="Chart settings"
        >
          <GearIcon size={18} />
        </Button>
      </Tooltip>
      {isMaximized && cellId !== undefined && (
        <CellToolbar inline cellId={cellId} />
      )}
    </Cluster>
  </Bar>
)
