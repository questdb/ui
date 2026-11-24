import React, { useState } from "react"
import {
  ArrowClockwiseIcon,
  BroadcastIcon,
  WarningIcon,
} from "@phosphor-icons/react"
import { ArrowDownS, Download2, ResetGrid } from "../../../../components/icons"
import { MoveColumnToFront } from "../../../../components/icons"
import { TableFreezeColumn } from "../../../../components/icons"
import { Markdown } from "../../../../components/icons"
import { Check } from "../../../../components/icons"
import { DropdownMenu, Tooltip } from "../../../../components"
import type { DqlQueryResult, GridMode } from "../../../../store/notebook"
import { liveModeBadge } from "../CellHighlight/LiveUpdatesSection"
import {
  buildResultPageMarkdown,
  type ResultGridHandle,
} from "../../../../components/ResultGrid"
import { copyToClipboard } from "../../../../utils/copyToClipboard"
import { downloadQueryResult } from "../../../../utils/downloadQueryResult"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"
import { useNotebookActions } from "../NotebookProvider"
import { expandGlobals } from "../declareUtils"
import { ActionButton, ActionsBar, FreezeToggle, LiveBadge } from "./styles"

const preventFocusSteal = (e: React.MouseEvent) => e.preventDefault()

type Props = {
  data: DqlQueryResult
  // A live grid mode shows as a badge that opens the grid settings.
  gridMode?: GridMode
  // The mode is set but cannot match rows (no identity columns in the result).
  liveInactive?: boolean
  onOpenLiveUpdates?: () => void
  gridRef: React.RefObject<ResultGridHandle | null>
  isFrozen: boolean
  hasSelection: boolean
  isRunning?: boolean
  onReRun?: () => void
}

export const ResultActionsBar: React.FC<Props> = ({
  data,
  gridRef,
  isFrozen,
  hasSelection,
  isRunning,
  onReRun,
  gridMode,
  liveInactive = false,
  onOpenLiveUpdates,
}) => {
  const { getVariables } = useNotebookActions()
  const [isCopied, setIsCopied] = useState(false)

  const copyMarkdown = () => {
    void trackEvent(ConsoleEvent.GRID_MARKDOWN_COPY, { source: "notebook" })
    void copyToClipboard(
      buildResultPageMarkdown(data.columns, data.dataset),
    ).then(() => {
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 1000)
    })
  }

  const toggleFreeze = () => {
    void trackEvent(ConsoleEvent.GRID_COLUMN_FREEZE, { source: "notebook" })
    gridRef.current?.toggleFreezeLeft()
  }

  const moveColumnToFront = () => {
    void trackEvent(ConsoleEvent.GRID_COLUMN_MOVE_TO_FRONT, {
      source: "notebook",
    })
    gridRef.current?.shuffleFocusedColumnToFront()
  }

  const resetLayout = () => {
    void trackEvent(ConsoleEvent.GRID_LAYOUT_RESET, { source: "notebook" })
    gridRef.current?.resetLayout()
  }

  const reRun = () => {
    void trackEvent(ConsoleEvent.GRID_REFRESH, { source: "notebook" })
    onReRun?.()
  }

  const download = (format: "parquet" | "csv") => {
    void trackEvent(
      format === "parquet"
        ? ConsoleEvent.GRID_PARQUET_DOWNLOAD
        : ConsoleEvent.GRID_CSV_DOWNLOAD,
      { source: "notebook" },
    )
    downloadQueryResult(expandGlobals(data.query, getVariables()), format)
  }

  return (
    <ActionsBar>
      {gridMode && (
        <Tooltip
          delay={350}
          placement="bottom"
          content={
            liveInactive
              ? "Live updates are off until columns that match rows are chosen: open grid settings"
              : "Live updates: change in grid settings"
          }
        >
          <LiveBadge
            variant="ghost"
            onClick={onOpenLiveUpdates}
            data-hook="grid-live-mode"
            $inactive={liveInactive}
            aria-label={`Live updates: ${liveModeBadge(gridMode)}${
              liveInactive ? ", waiting for columns that match rows" : ""
            }. Open grid settings`}
          >
            {liveInactive ? (
              <WarningIcon size={14} />
            ) : (
              <BroadcastIcon size={14} />
            )}
            {liveModeBadge(gridMode)}
          </LiveBadge>
        </Tooltip>
      )}

      <Tooltip delay={350} placement="bottom" content="Copy result to Markdown">
        <ActionButton
          variant="ghost"
          aria-label="Copy result to Markdown"
          onClick={copyMarkdown}
        >
          {isCopied ? <Check size="18px" /> : <Markdown size="18px" />}
        </ActionButton>
      </Tooltip>

      <Tooltip delay={350} placement="bottom" content="Freeze left column">
        <FreezeToggle
          selected={isFrozen}
          aria-label="Freeze left column"
          onClick={toggleFreeze}
        >
          <TableFreezeColumn size="18px" style={{ transform: "scaleX(-1)" }} />
        </FreezeToggle>
      </Tooltip>

      <Tooltip
        delay={350}
        placement="bottom"
        content="Move selected column to the front"
      >
        <ActionButton
          variant="ghost"
          aria-label="Move selected column to the front"
          disabled={!hasSelection}
          onMouseDown={preventFocusSteal}
          onClick={moveColumnToFront}
        >
          <MoveColumnToFront size="18px" weight="regular" />
        </ActionButton>
      </Tooltip>

      <Tooltip delay={350} placement="bottom" content="Reset grid layout">
        <ActionButton
          variant="ghost"
          aria-label="Reset grid layout"
          onClick={resetLayout}
        >
          <ResetGrid size="18px" weight="regular" />
        </ActionButton>
      </Tooltip>

      <Tooltip delay={350} placement="bottom" content="Re-run query">
        <ActionButton
          variant="ghost"
          aria-label="Re-run query"
          disabled={isRunning || !onReRun}
          onClick={reRun}
        >
          <ArrowClockwiseIcon size="18px" weight="regular" />
        </ActionButton>
      </Tooltip>

      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <ActionButton variant="ghost" aria-label="Download result">
            <Download2 size="18px" />
            <ArrowDownS size="14px" />
          </ActionButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content sideOffset={4} align="end">
            <DropdownMenu.Item onSelect={() => download("parquet")}>
              Download as Parquet
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => download("csv")}>
              Download as CSV
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </ActionsBar>
  )
}
