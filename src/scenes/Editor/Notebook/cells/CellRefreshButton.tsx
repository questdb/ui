import React from "react"
import styled from "styled-components"
import { ArrowClockwiseIcon, CaretDownIcon } from "@phosphor-icons/react"
import { DropdownMenu, Tooltip, Button } from "../../../../components"
import { Spinner } from "./Spinner"
import { AutoRefreshOptions } from "./AutoRefreshOptions"
import { useNotebookActions } from "../NotebookProvider"
import { autoRefreshLabel } from "../notebookUtils"
import type { AutoRefresh } from "../../../../store/notebook"
import { signalUserEdit } from "../../../../utils/notebookAIBridge"
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
  background: transparent !important;
  color: ${({ theme }) => theme.color.foreground};
  font-size: 1.4rem;
  cursor: pointer;

  svg {
    width: 1.8rem;
    height: 1.8rem;
  }

  &:hover:not(:disabled) {
    background: ${({ theme }) => `${theme.color.selection}80`} !important;
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
  const isChart = view === "chart"

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation()
    signalUserEdit()
    eventBus.publish(
      isChart
        ? EventType.NOTEBOOK_CELL_REFRESH_CHART
        : EventType.NOTEBOOK_CELL_RUN,
      { cellId },
    )
  }
  const handleSelect = (value: AutoRefresh) => {
    signalUserEdit()
    setCellRefresh(cellId, value)
  }

  return (
    <Container>
      <Tooltip content={isChart ? "Refresh chart" : "Refresh"}>
        <SplitSide
          type="button"
          onClick={handleRefresh}
          aria-label="Refresh"
          disabled={isRefreshing}
        >
          {isRefreshing ? <Spinner size={18} /> : <ArrowClockwiseIcon />}
        </SplitSide>
      </Tooltip>
      {isChart && (
        <>
          <SplitDivider />
          <DropdownMenu.Root>
            <Tooltip content="Auto-refresh interval">
              <DropdownMenu.Trigger asChild>
                <SplitSide
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
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                // Don't restore focus to the trigger on close — that refocus
                // re-opens its Tooltip, which then stays stuck open.
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
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
