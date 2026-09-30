import React, { useState } from "react"
import { ArrowClockwiseIcon } from "@phosphor-icons/react"
import { SelectMenu, Spinner, Tooltip } from "../../../../components"
import { useHeldFlag } from "../../../../hooks"
import { AutoRefreshOptions } from "./AutoRefreshOptions"
import { useTriggerTooltip } from "./useTriggerTooltip"
import { useNotebookActions, useNotebookBufferId } from "../NotebookProvider"
import {
  selectFetching,
  selectWriteBlocked,
  useCellFetchSelector,
} from "../cellRefresh/CellRefreshContext"
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

// A refresh keeps the button busy (spinner, no clicks) for at least this
// long: a cell polling at this rate or faster shows one continuous spinner
// instead of a flicker, and a refresh by hand waits until the last one is a
// moment old.
const REFRESH_BUSY_MIN_MS = 1000

type RefreshTriggerProps = {
  cellId: string
  isChart: boolean
  isRerunning: boolean
}

// Owns the fetching subscription, so a poll tick re-renders the button alone
// and not the interval menu beside it.
const RefreshTrigger: React.FC<RefreshTriggerProps> = ({
  cellId,
  isChart,
  isRerunning,
}) => {
  const bufferId = useNotebookBufferId()
  const fetching = useCellFetchSelector(cellId, selectFetching)
  const refreshing = isRerunning || fetching
  const busy = useHeldFlag(refreshing, REFRESH_BUSY_MIN_MS)

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    signalUserEdit(bufferId)
    if (isChart) void trackEvent(ConsoleEvent.NOTEBOOK_CELL_DRAW)
    eventBus.publish(
      isChart
        ? EventType.NOTEBOOK_CELL_REFRESH_CHART
        : EventType.NOTEBOOK_CELL_RUN,
      { cellId },
    )
  }

  return (
    <Tooltip content={isChart ? "Refresh chart" : "Refresh"}>
      <EditorRefreshButton
        variant="secondary"
        type="button"
        onClick={handleRefresh}
        aria-label="Refresh"
        aria-busy={busy}
        // aria-disabled + click guard, not native disabled: a poll tick must
        // not evict keyboard focus from the button mid-cycle.
        aria-disabled={busy || undefined}
      >
        {busy ? <Spinner size={18} /> : <ArrowClockwiseIcon />}
      </EditorRefreshButton>
    </Tooltip>
  )
}

type Props = {
  cellId: string
  // Chart refreshes its own fetch; a grid refresh re-runs the statements while
  // the old rows stay visible. Both views expose the interval dropdown.
  view: "grid" | "chart"
  cellAutoRefresh: AutoRefresh | undefined
  autoRefreshDefault: AutoRefresh | undefined
  isRerunning: boolean
}

export const CellRefreshButton: React.FC<Props> = ({
  cellId,
  view,
  cellAutoRefresh,
  autoRefreshDefault,
  isRerunning,
}) => {
  const { setCellRefresh } = useNotebookActions()
  const bufferId = useNotebookBufferId()
  const writeBlockedCell = useCellFetchSelector(cellId, selectWriteBlocked)
  const isChart = view === "chart"
  const autoRefresh = resolveAutoRefresh(cellAutoRefresh, autoRefreshDefault)
  const hasOverride = cellAutoRefresh !== undefined
  const writeBlocked = view === "grid" && writeBlockedCell
  const intervalTooltip = useTriggerTooltip()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleMenuOpenChange = (open: boolean) => {
    setMenuOpen(open)
    intervalTooltip.onMenuOpenChange(open)
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
      <RefreshTrigger
        cellId={cellId}
        isChart={isChart}
        isRerunning={isRerunning}
      />
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
        <SelectMenu.Root open={menuOpen} onOpenChange={handleMenuOpenChange}>
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
                onClose={() => handleMenuOpenChange(false)}
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
