import React from "react"
import { ArrowClockwiseIcon } from "@phosphor-icons/react"
import { SelectMenu, Tooltip } from "../../../../components"
import { Spinner } from "./Spinner"
import { AutoRefreshOptions } from "./AutoRefreshOptions"
import { useTriggerTooltip } from "./useTriggerTooltip"
import { useNotebookActions, useNotebookBufferId } from "../NotebookProvider"
import { useCellFetchState } from "../cellRefresh/CellRefreshContext"
import { autoRefreshLabel, resolveAutoRefresh } from "../notebookUtils"
import type { AutoRefresh } from "../../../../store/notebook"
import { OverrideDot } from "../refreshSplitButton"
import { signalUserEdit } from "../../../../utils/notebooks/notebookAIBridge"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"
import {
  EditorRefreshButton,
  EditorRefreshControlGroup,
  EditorRefreshIntervalTrigger,
  EditorRefreshIntervalTriggerButton,
} from "../../ToolbarRefreshControls"

const WRITE_BLOCK_TOOLTIP =
  "This cell contains DDL/DML, auto-refresh is disabled"

type Props = {
  cellId: string
  // Chart refreshes its own fetch; a grid refresh re-runs the statements while
  // the old rows stay visible. Both views expose the interval dropdown.
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
  const fetchState = useCellFetchState(cellId)
  const isChart = view === "chart"
  const autoRefresh = resolveAutoRefresh(cellAutoRefresh, autoRefreshDefault)
  const hasOverride = cellAutoRefresh !== undefined
  const writeBlocked =
    view === "grid" && fetchState?.classifyBlock?.kind === "write"
  const refreshing =
    isRefreshing || (view === "grid" && (fetchState?.fetching ?? false))
  const intervalTooltip = useTriggerTooltip()

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (refreshing) return
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
    <EditorRefreshControlGroup>
      <Tooltip content={isChart ? "Refresh chart" : "Refresh"}>
        <EditorRefreshButton
          variant="secondary"
          type="button"
          onClick={handleRefresh}
          aria-label="Refresh"
          aria-busy={refreshing}
          // aria-disabled + click guard, not native disabled: a poll tick must
          // not evict keyboard focus from the button mid-cycle.
          aria-disabled={refreshing || undefined}
        >
          {refreshing ? <Spinner size={18} /> : <ArrowClockwiseIcon />}
        </EditorRefreshButton>
      </Tooltip>
      {writeBlocked ? (
        <Tooltip content={WRITE_BLOCK_TOOLTIP}>
          <EditorRefreshIntervalTriggerButton
            label="Off"
            type="button"
            aria-label={WRITE_BLOCK_TOOLTIP}
            aria-disabled
          />
        </Tooltip>
      ) : (
        <SelectMenu.Root onOpenChange={intervalTooltip.onMenuOpenChange}>
          <Tooltip
            content={
              hasOverride
                ? "Auto-refresh interval (overrides notebook default)"
                : "Auto-refresh interval"
            }
            {...intervalTooltip.tooltipProps}
          >
            <EditorRefreshIntervalTrigger
              label={autoRefreshLabel(autoRefresh)}
              leadingIcon={hasOverride ? <OverrideDot /> : undefined}
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Auto-refresh interval: ${autoRefreshLabel(
                autoRefresh,
              )}${hasOverride ? " (overrides notebook default)" : ""}`}
            />
          </Tooltip>
          <SelectMenu.Portal>
            <SelectMenu.Content align="end" sideOffset={4}>
              <AutoRefreshOptions
                value={cellAutoRefresh}
                onSelect={handleSelect}
                inheritedValue={resolveAutoRefresh(
                  undefined,
                  autoRefreshDefault,
                )}
              />
            </SelectMenu.Content>
          </SelectMenu.Portal>
        </SelectMenu.Root>
      )}
    </EditorRefreshControlGroup>
  )
}
