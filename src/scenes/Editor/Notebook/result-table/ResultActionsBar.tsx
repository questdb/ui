import React, { useState } from "react"
import { Download2, ArrowDownS } from "@styled-icons/remix-line"
import { Reset } from "@styled-icons/boxicons-regular"
import { HandPointLeft } from "@styled-icons/fa-regular"
import { TableFreezeColumn } from "@styled-icons/fluentui-system-filled"
import { Markdown } from "@styled-icons/bootstrap/Markdown"
import { Check } from "@styled-icons/bootstrap/Check"
import { DropdownMenu, Tooltip } from "../../../../components"
import type { DqlQueryResult } from "../../../../store/notebook"
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
import { ActionButton, ActionsBar, FreezeToggle } from "./styles"
import { ArrowClockwiseIcon } from "@phosphor-icons/react"

const preventFocusSteal = (e: React.MouseEvent) => e.preventDefault()

type Props = {
  data: DqlQueryResult
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
      <Tooltip delay={350} placement="bottom" content="Copy result to Markdown">
        <ActionButton
          skin="transparent"
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
          skin="transparent"
          aria-label="Move selected column to the front"
          disabled={!hasSelection}
          onMouseDown={preventFocusSteal}
          onClick={moveColumnToFront}
        >
          <HandPointLeft size="18px" />
        </ActionButton>
      </Tooltip>

      <Tooltip delay={350} placement="bottom" content="Reset grid layout">
        <ActionButton
          skin="transparent"
          aria-label="Reset grid layout"
          onClick={resetLayout}
        >
          <Reset size="18px" />
        </ActionButton>
      </Tooltip>

      <Tooltip delay={350} placement="bottom" content="Re-run query">
        <ActionButton
          skin="transparent"
          aria-label="Re-run query"
          disabled={isRunning || !onReRun}
          onClick={reRun}
        >
          <ArrowClockwiseIcon size="18px" weight="bold" />
        </ActionButton>
      </Tooltip>

      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <ActionButton skin="transparent" aria-label="Download result">
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
