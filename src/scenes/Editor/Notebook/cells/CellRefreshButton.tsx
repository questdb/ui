import React from "react"
import { ArrowClockwiseIcon } from "@phosphor-icons/react"
import { SelectMenu, Tooltip } from "../../../../components"
import { Spinner } from "./Spinner"
import { AutoRefreshOptions } from "./AutoRefreshOptions"
import { useTriggerTooltip } from "./useTriggerTooltip"
import { useNotebookActions, useNotebookBufferId } from "../NotebookProvider"
import { autoRefreshLabel } from "../notebookUtils"
import type { AutoRefresh } from "../../../../store/notebook"
import { signalUserEdit } from "../../../../utils/notebooks/notebookAIBridge"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"
import {
  EditorRefreshButton,
  EditorRefreshControlGroup,
  EditorRefreshIntervalTrigger,
} from "../../ToolbarRefreshControls"

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
    if (isChart) void trackEvent(ConsoleEvent.NOTEBOOK_CELL_DRAW)
    eventBus.publish(
      isChart
        ? EventType.NOTEBOOK_CELL_REFRESH_CHART
        : EventType.NOTEBOOK_CELL_RUN,
      { cellId },
    )
  }
  const handleSelect = (value: AutoRefresh) => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_AUTOREFRESH_CHANGE, {
      from: autoRefreshLabel(autoRefresh),
      to: autoRefreshLabel(value),
      trigger: "button",
    })
    signalUserEdit(bufferId)
    setCellRefresh(cellId, value)
  }

  return (
    <EditorRefreshControlGroup>
      <Tooltip content={isChart ? "Refresh chart" : "Refresh"}>
        <EditorRefreshButton
          variant="secondary"
          type="button"
          onClick={handleRefresh}
          aria-label="Refresh"
          aria-busy={isRefreshing}
          disabled={isRefreshing}
        >
          {isRefreshing ? <Spinner size={18} /> : <ArrowClockwiseIcon />}
        </EditorRefreshButton>
      </Tooltip>
      {isChart && (
        <SelectMenu.Root onOpenChange={intervalTooltip.onMenuOpenChange}>
          <Tooltip
            content="Auto-refresh interval"
            {...intervalTooltip.tooltipProps}
          >
            <EditorRefreshIntervalTrigger
              label={autoRefreshLabel(autoRefresh)}
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label="Auto-refresh interval"
            />
          </Tooltip>
          <SelectMenu.Portal>
            <SelectMenu.Content align="end" sideOffset={4}>
              <AutoRefreshOptions value={autoRefresh} onSelect={handleSelect} />
            </SelectMenu.Content>
          </SelectMenu.Portal>
        </SelectMenu.Root>
      )}
    </EditorRefreshControlGroup>
  )
}
