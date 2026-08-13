import React, { useState } from "react"
import styled from "styled-components"
import { ArrowClockwiseIcon, CaretDownIcon } from "@phosphor-icons/react"
import { DropdownMenu, Tooltip } from "../../../components"
import { AutoRefreshOptions } from "./cells/AutoRefreshOptions"
import { useTriggerTooltip } from "./cells/useTriggerTooltip"
import {
  useNotebookActions,
  useNotebookBufferId,
  useNotebookState,
} from "./NotebookProvider"
import { useCellRefresh } from "./cellRefresh/CellRefreshContext"
import {
  autoRefreshLabel,
  countActiveAutoRefreshOverrides,
  resolveCellView,
} from "./notebookUtils"
import type { AutoRefresh } from "../../../store/notebook"
import {
  IntervalLabel,
  OverrideDot,
  SplitButtonContainer,
  SplitDivider,
  SplitSide,
} from "./refreshSplitButton"
import {
  emitUserAction,
  signalUserEdit,
} from "../../../utils/notebooks/notebookAIBridge"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"

const ResetItemTitle = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
`

const MenuHint = styled.div`
  max-width: 24rem;
  padding: 0.4rem 1rem 0.6rem;
  color: ${({ theme }) => theme.color.gray2};
  font-size: ${({ theme }) => theme.fontSize.sm};
`

export const NotebookRefreshControl: React.FC = () => {
  const { cells, settings } = useNotebookState()
  const { refreshAllCells, resetAutoRefreshOverrides, updateSettings } =
    useNotebookActions()
  const bufferId = useNotebookBufferId()
  const cellRefresh = useCellRefresh()
  const storedDefault = settings.autoRefreshDefault
  const defaultLabel = autoRefreshLabel(storedDefault ?? false)
  const overrideCount = countActiveAutoRefreshOverrides(cells)
  const refreshableCellCount = cells.filter(
    (cell) => resolveCellView(cell) !== "none",
  ).length
  const [writeBlockedCount, setWriteBlockedCount] = useState(0)
  const intervalAriaLabel =
    overrideCount > 0
      ? `Notebook auto-refresh: ${defaultLabel}, ${overrideCount} ${
          overrideCount === 1 ? "cell override" : "cell overrides"
        }`
      : `Notebook auto-refresh: ${defaultLabel}`
  const intervalTooltip = useTriggerTooltip()

  const handleRefreshAll = () => {
    if (refreshableCellCount === 0) return
    signalUserEdit(bufferId)
    const counts = refreshAllCells()
    void trackEvent(ConsoleEvent.NOTEBOOK_REFRESH_ALL, {
      refreshedCount: counts.refreshed,
      skippedWriteCount: counts.skippedWrites,
    })
  }

  const handleMenuOpenChange = (open: boolean) => {
    intervalTooltip.onMenuOpenChange(open)
    if (open) setWriteBlockedCount(cellRefresh?.countWriteBlockedGrids() ?? 0)
  }

  const handleSelectDefault = (value: AutoRefresh | undefined) => {
    if (value === undefined || value === storedDefault) return
    void trackEvent(ConsoleEvent.NOTEBOOK_AUTOREFRESH_DEFAULT_CHANGE, {
      from:
        storedDefault === undefined ? "unset" : autoRefreshLabel(storedDefault),
      to: autoRefreshLabel(value),
    })
    updateSettings({ autoRefreshDefault: value })
    emitUserAction({
      kind: "user_changed_autorefresh_default",
      bufferId,
      value,
    })
  }

  return (
    <SplitButtonContainer>
      <Tooltip
        content={
          refreshableCellCount === 0 ? "No cells to refresh" : "Refresh cells"
        }
      >
        <SplitSide
          skin="transparent"
          type="button"
          onClick={handleRefreshAll}
          aria-label="Refresh cells"
          aria-disabled={refreshableCellCount === 0}
        >
          <ArrowClockwiseIcon />
        </SplitSide>
      </Tooltip>
      <SplitDivider />
      <DropdownMenu.Root onOpenChange={handleMenuOpenChange}>
        <Tooltip
          content="Notebook auto-refresh"
          {...intervalTooltip.tooltipProps}
        >
          <DropdownMenu.Trigger asChild>
            <SplitSide
              skin="transparent"
              type="button"
              aria-label={intervalAriaLabel}
            >
              {overrideCount > 0 && <OverrideDot />}
              <IntervalLabel>{defaultLabel}</IntervalLabel>
              <CaretDownIcon />
            </SplitSide>
          </DropdownMenu.Trigger>
        </Tooltip>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={4}>
            <AutoRefreshOptions
              value={storedDefault ?? false}
              onSelect={handleSelectDefault}
            />
            {overrideCount > 0 && (
              <>
                <DropdownMenu.Divider />
                <DropdownMenu.Item
                  onSelect={resetAutoRefreshOverrides}
                  subtitle={`${overrideCount} ${
                    overrideCount === 1
                      ? "cell currently overrides"
                      : "cells currently override"
                  } the notebook default`}
                >
                  <ResetItemTitle>
                    <OverrideDot />
                    Reset cell overrides
                  </ResetItemTitle>
                </DropdownMenu.Item>
              </>
            )}
            {writeBlockedCount > 0 && (
              <>
                <DropdownMenu.Divider />
                <MenuHint>
                  {writeBlockedCount === 1
                    ? "1 cell contains DDL/DML and is excluded from auto-refresh."
                    : `${writeBlockedCount} cells contain DDL/DML and are excluded from auto-refresh.`}
                </MenuHint>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </SplitButtonContainer>
  )
}
