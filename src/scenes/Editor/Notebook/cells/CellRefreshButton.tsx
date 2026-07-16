import React from "react"
import styled from "styled-components"
import { ArrowClockwiseIcon, CaretDownIcon } from "@phosphor-icons/react"
import { DropdownMenu, Tooltip, Button } from "../../../../components"
import { Spinner } from "./Spinner"
import { AutoRefreshOptions } from "./AutoRefreshOptions"
import { useTriggerTooltip } from "./useTriggerTooltip"
import { useNotebookActions, useNotebookBufferId } from "../NotebookProvider"
import { autoRefreshLabel } from "../notebookUtils"
import type { AutoRefresh } from "../../../../store/notebook"
import { signalUserEdit } from "../../../../utils/notebooks/notebookAIBridge"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"

const Container = styled.div`
  display: flex;
  align-items: center;
  border-radius: 0.4rem;
  background: ${({ theme }) => theme.color.backgroundLighter};
  border: 1px solid ${({ theme }) => `${theme.color.selection}80`};
`

const SplitSide = styled(Button)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 3rem;
  padding: 0 1.1rem;
  border: none;
  border-radius: 0;
  color: ${({ theme }) => theme.color.foreground};
  font-size: 1.4rem;
  cursor: pointer;

  svg {
    width: 1.8rem;
    height: 1.8rem;
  }

  &&:hover:not(:disabled) {
    background: ${({ theme }) => `${theme.color.selection}80`};
    color: ${({ theme }) => theme.color.foreground};
  }

  &:disabled {
    opacity: 0.5;
  }
`

const SplitDivider = styled.div`
  width: 1px;
  align-self: stretch;
  margin: 0;
  background: ${({ theme }) => theme.color.selection};
`

const IntervalLabel = styled.span`
  color: ${({ theme }) => theme.color.gray2};
`

type Props = {
  cellId: string
  // Grid refreshes by re-running the query and has no auto-refresh interval;
  // chart refreshes its own fetch and exposes the interval dropdown.
  view: "grid" | "chart"
  autoRefresh: AutoRefresh
  isRefreshing: boolean
}

export const CellRefreshButton: React.FC<Props> = ({
  cellId,
  view,
  autoRefresh,
  isRefreshing,
}) => {
  const { setCellRefresh } = useNotebookActions()
  const bufferId = useNotebookBufferId()
  const isChart = view === "chart"
  const intervalTooltip = useTriggerTooltip()

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation()
    signalUserEdit(bufferId)
    eventBus.publish(
      isChart
        ? EventType.NOTEBOOK_CELL_REFRESH_CHART
        : EventType.NOTEBOOK_CELL_RUN,
      { cellId },
    )
  }
  const handleSelect = (value: AutoRefresh) => {
    signalUserEdit(bufferId)
    setCellRefresh(cellId, value)
  }

  return (
    <Container>
      <Tooltip content={isChart ? "Refresh chart" : "Refresh"}>
        <SplitSide
          skin="transparent"
          type="button"
          onClick={handleRefresh}
          aria-label="Refresh"
          aria-busy={isRefreshing}
          disabled={isRefreshing}
        >
          {isRefreshing ? <Spinner size={18} /> : <ArrowClockwiseIcon />}
        </SplitSide>
      </Tooltip>
      {isChart && (
        <>
          <SplitDivider />
          <DropdownMenu.Root onOpenChange={intervalTooltip.onMenuOpenChange}>
            <Tooltip
              content="Auto-refresh interval"
              {...intervalTooltip.tooltipProps}
            >
              <DropdownMenu.Trigger asChild>
                <SplitSide
                  skin="transparent"
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Auto-refresh interval"
                >
                  <IntervalLabel>{autoRefreshLabel(autoRefresh)}</IntervalLabel>
                  <CaretDownIcon />
                </SplitSide>
              </DropdownMenu.Trigger>
            </Tooltip>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={4}>
                <AutoRefreshOptions
                  value={autoRefresh}
                  onSelect={handleSelect}
                />
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </>
      )}
    </Container>
  )
}
