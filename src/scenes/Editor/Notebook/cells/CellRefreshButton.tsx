import React from "react"
import { ArrowClockwiseIcon, CaretDownIcon } from "@phosphor-icons/react"
import { DropdownMenu, Tooltip } from "../../../../components"
import { Spinner } from "./Spinner"
import { AutoRefreshOptions } from "./AutoRefreshOptions"
import { useTriggerTooltip } from "./useTriggerTooltip"
import { useNotebookActions, useNotebookBufferId } from "../NotebookProvider"
import { autoRefreshLabel, resolveAutoRefresh } from "../notebookUtils"
import type { AutoRefresh } from "../../../../store/notebook"
import {
  IntervalLabel,
  OverrideDot,
  SplitButtonContainer,
  SplitDivider,
  SplitSide,
} from "../refreshSplitButton"
import { signalUserEdit } from "../../../../utils/notebooks/notebookAIBridge"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"

type Props = {
  cellId: string
  // Grid refreshes by re-running the query and has no auto-refresh interval;
  // chart refreshes its own fetch and exposes the interval dropdown.
  view: "grid" | "chart"
  cellAutoRefresh: AutoRefresh | undefined
  autoRefreshDefault: AutoRefresh | undefined
  isRefreshing: boolean
}

export const CellRefreshButton: React.FC<Props> = ({
  cellId,
  view,
  cellAutoRefresh,
  autoRefreshDefault,
  isRefreshing,
}) => {
  const { setCellRefresh } = useNotebookActions()
  const bufferId = useNotebookBufferId()
  const isChart = view === "chart"
  const autoRefresh = resolveAutoRefresh(cellAutoRefresh, autoRefreshDefault)
  const hasOverride = cellAutoRefresh !== undefined
  const intervalTooltip = useTriggerTooltip()

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation()
    signalUserEdit(bufferId)
    if (isChart) void trackEvent(ConsoleEvent.NOTEBOOK_CELL_DRAW)
    eventBus.publish(
      isChart
        ? EventType.NOTEBOOK_CELL_REFRESH_CHART
        : EventType.NOTEBOOK_CELL_RUN,
      { cellId },
    )
  }
  const handleSelect = (value: AutoRefresh | undefined) => {
    if (value === cellAutoRefresh) return
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_AUTOREFRESH_CHANGE, {
      from: autoRefreshLabel(autoRefresh),
      to: value === undefined ? "default" : autoRefreshLabel(value),
      trigger: "button",
    })
    signalUserEdit(bufferId)
    setCellRefresh(cellId, value)
  }

  return (
    <SplitButtonContainer>
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
              content={
                hasOverride
                  ? "Auto-refresh interval (overrides notebook default)"
                  : "Auto-refresh interval"
              }
              {...intervalTooltip.tooltipProps}
            >
              <DropdownMenu.Trigger asChild>
                <SplitSide
                  skin="transparent"
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Auto-refresh interval: ${autoRefreshLabel(
                    autoRefresh,
                  )}${hasOverride ? " (overrides notebook default)" : ""}`}
                >
                  {hasOverride && <OverrideDot />}
                  <IntervalLabel>{autoRefreshLabel(autoRefresh)}</IntervalLabel>
                  <CaretDownIcon />
                </SplitSide>
              </DropdownMenu.Trigger>
            </Tooltip>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={4}>
                <AutoRefreshOptions
                  value={cellAutoRefresh}
                  onSelect={handleSelect}
                  inheritedValue={resolveAutoRefresh(
                    undefined,
                    autoRefreshDefault,
                  )}
                />
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </>
      )}
    </SplitButtonContainer>
  )
}
