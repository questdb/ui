import React from "react"
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
import { autoRefreshLabel, countAutoRefreshOverrides } from "./notebookUtils"
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

export const NotebookRefreshControl: React.FC = () => {
  const { cells, settings } = useNotebookState()
  const { refreshAllCharts, resetAutoRefreshOverrides, updateSettings } =
    useNotebookActions()
  const bufferId = useNotebookBufferId()
  const defaultValue = settings.autoRefreshDefault ?? true
  const defaultLabel = autoRefreshLabel(defaultValue)
  const overrideCount = countAutoRefreshOverrides(cells)
  const drawCellCount = cells.filter((cell) => cell.mode === "draw").length
  const intervalAriaLabel =
    overrideCount > 0
      ? `Notebook auto-refresh: ${defaultLabel}, ${overrideCount} ${
          overrideCount === 1 ? "cell override" : "cell overrides"
        }`
      : `Notebook auto-refresh: ${defaultLabel}`
  const intervalTooltip = useTriggerTooltip()

  const handleRefreshAll = () => {
    void trackEvent(ConsoleEvent.NOTEBOOK_REFRESH_ALL, {
      chartCount: drawCellCount,
    })
    signalUserEdit(bufferId)
    refreshAllCharts()
  }

  const handleSelectDefault = (value: AutoRefresh | undefined) => {
    if (value === undefined || value === defaultValue) return
    void trackEvent(ConsoleEvent.NOTEBOOK_AUTOREFRESH_DEFAULT_CHANGE, {
      from: defaultLabel,
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
      <Tooltip content="Refresh charts">
        <SplitSide
          skin="transparent"
          type="button"
          onClick={handleRefreshAll}
          aria-label="Refresh charts"
          disabled={drawCellCount === 0}
        >
          <ArrowClockwiseIcon />
        </SplitSide>
      </Tooltip>
      <SplitDivider />
      <DropdownMenu.Root onOpenChange={intervalTooltip.onMenuOpenChange}>
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
              value={defaultValue}
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
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </SplitButtonContainer>
  )
}
