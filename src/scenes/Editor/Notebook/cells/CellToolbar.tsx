import React, { useState } from "react"
import styled, { css } from "styled-components"
import {
  ChevronUp,
  ChevronDown,
  CopyAlt,
  Trash,
  Reset,
} from "@styled-icons/boxicons-regular"
import {
  DotsThreeVerticalIcon,
  CornersOutIcon,
  CornersInIcon,
  ArrowClockwiseIcon,
  ArrowsOutLineVerticalIcon,
  ArrowsInLineVerticalIcon,
  GearIcon,
  TableIcon,
  ChartLineIcon,
  PlayIcon,
  FileSqlIcon,
} from "@phosphor-icons/react"
import { DropdownMenu, Button, Tooltip } from "../../../../components"
import { AutoRefreshOptions } from "./AutoRefreshOptions"
import { useTriggerTooltip } from "./useTriggerTooltip"
import {
  autoRefreshLabel,
  cellToolbarMenuFlags,
  resolveCellView,
} from "../notebookUtils"
import type { CellToolbarTier } from "../notebookUtils"
import type { AutoRefresh, NotebookCell } from "../../../../store/notebook"
import { useNotebookActions } from "../NotebookProvider"
import { useEditor } from "../../../../providers/EditorProvider"
import {
  emitUserAction,
  signalUserEdit,
} from "../../../../utils/notebookAIBridge"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"

const ToolbarWrapper = styled.div<{
  $inline?: boolean
  $forceVisible?: boolean
}>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;

  ${({ $inline, $forceVisible }) =>
    $inline
      ? ""
      : css`
          position: absolute;
          top: 0.4rem;
          right: 0.6rem;
          z-index: 2;
          opacity: ${$forceVisible ? 1 : 0};
          transition: opacity 0.1s;
        `}
`

// Maximize / more-actions match the Run/Draw toggles: a `selection` hover fill
// instead of the transparent skin's default.
const ToolbarButton = styled(Button)`
  &&:hover:not([disabled]) {
    background: ${({ theme }) => theme.color.selection};
  }
`

// Delete adopts the Button "danger" skin on hover — destructive actions read red.
const DangerItem = styled(DropdownMenu.Item)`
  &[data-highlighted] {
    background: ${({ theme }) => theme.color.dangerBackground};
    color: ${({ theme }) => theme.color.dangerForeground};
  }
`

type Props = {
  cellId: string
  cell: NotebookCell
  cellIndex: number
  totalCells: number
  layoutMode: "list" | "grid"
  isMaximized: boolean
  inline?: boolean
  toolbarTier?: CellToolbarTier
  chartZoomed?: boolean
}

export const CellToolbar: React.FC<Props> = ({
  cellId,
  cell,
  cellIndex,
  totalCells,
  layoutMode,
  isMaximized,
  inline,
  toolbarTier,
  chartZoomed = false,
}) => {
  const {
    moveCellUp,
    moveCellDown,
    duplicateCell,
    deleteCell,
    setMaximizedCellId,
    setCellRefresh,
    setCellViewMaximized,
    setCellMode,
  } = useNotebookActions()
  const { activeBuffer } = useEditor()

  // Grid positions cells via settings.layout, so swapping array order doesn't
  // move them visually — hide move up/down there.
  const isGridMode = layoutMode === "grid"
  // Markdown cells have no run/draw views — keep their menu to move/dup/delete.
  const isMarkdown = cell.type === "markdown"
  const view = resolveCellView(cell)
  const isChartView = view === "chart"
  const isGridView = view === "grid"
  const isNoneView = view === "none"
  const isViewMaximized = !isNoneView && !!cell.isViewMaximized
  const autoRefresh = cell.autoRefresh ?? true
  const [menuOpen, setMenuOpen] = useState(false)
  const moreActionsTooltip = useTriggerTooltip()

  const {
    showViewSql,
    showViewTable,
    showViewChart,
    showSplitItem,
    showResetZoom,
    showAutoRefreshItem,
    showRefreshItem,
    showChartSettings,
    showMoveUp,
    showMoveDown,
    showDuplicate,
    showDelete,
    groupAHasItems,
    groupBHasItems,
  } = cellToolbarMenuFlags({
    tier: toolbarTier ?? "compact",
    view,
    isMarkdown,
    // "View SQL" minimizes the chart/table to the editor without dropping data.
    sqlShown: cell.isViewMaximized === false,
    chartZoomed,
    isGridMode,
    cellIndex,
    totalCells,
  })

  // Minimize the chart/table to the editor, keeping the data on the cell.
  const handleViewSql = () => {
    signalUserEdit()
    setCellViewMaximized(cellId, false)
  }
  const handleViewTable = () => {
    signalUserEdit()
    if (isNoneView) {
      eventBus.publish(EventType.NOTEBOOK_CELL_RUN, { cellId })
      return
    }
    // A chart transfers its data to the grid (no re-query); restore the data
    // pane in case the SQL was being shown.
    if (isChartView) setCellMode(cellId, "run")
    setCellViewMaximized(cellId, true)
  }
  const handleViewChart = () => {
    signalUserEdit()
    if (isNoneView || isGridView) {
      // Entering draw can be refused (non-DQL SQL); maximize only once the
      // draw actually takes, so a refused chart never maximizes the grid.
      eventBus.publish(EventType.NOTEBOOK_CELL_DRAW, { cellId, maximize: true })
      return
    }
    setCellViewMaximized(cellId, true)
  }
  const handleToggleMaximizeView = () => {
    signalUserEdit()
    setCellViewMaximized(cellId, !cell.isViewMaximized)
  }
  const handleMaximizeCell = () => {
    signalUserEdit()
    setMaximizedCellId(isMaximized ? null : cellId)
  }
  const handleRefreshNow = () => {
    signalUserEdit()
    eventBus.publish(
      isChartView
        ? EventType.NOTEBOOK_CELL_REFRESH_CHART
        : EventType.NOTEBOOK_CELL_RUN,
      { cellId },
    )
  }
  const handleResetZoom = () =>
    eventBus.publish(EventType.NOTEBOOK_CELL_RESET_ZOOM, { cellId })
  const handleChartSettings = () =>
    eventBus.publish(EventType.NOTEBOOK_CELL_OPEN_CHART_SETTINGS, { cellId })
  const handleRefreshSelect = (value: AutoRefresh) => {
    signalUserEdit()
    setCellRefresh(cellId, value)
  }

  const handleMoveUp = () => {
    moveCellUp(cellId)
    if (typeof activeBuffer.id === "number") {
      emitUserAction({
        kind: "user_moved_cell",
        bufferId: activeBuffer.id,
        cellId,
      })
    }
  }
  const handleMoveDown = () => {
    moveCellDown(cellId)
    if (typeof activeBuffer.id === "number") {
      emitUserAction({
        kind: "user_moved_cell",
        bufferId: activeBuffer.id,
        cellId,
      })
    }
  }
  const handleDuplicate = () => {
    const newCellId = duplicateCell(cellId)
    if (typeof activeBuffer.id === "number" && newCellId) {
      emitUserAction({
        kind: "user_duplicated_cell",
        bufferId: activeBuffer.id,
        cellId,
        newCellId,
      })
    }
  }
  const handleDelete = () => {
    deleteCell(cellId)
    if (typeof activeBuffer.id === "number") {
      emitUserAction({
        kind: "user_deleted_cell",
        bufferId: activeBuffer.id,
        cellId,
      })
    }
  }

  return (
    <ToolbarWrapper
      className="cell-toolbar"
      $inline={inline}
      $forceVisible={menuOpen}
    >
      <Tooltip content={isMaximized ? "Restore" : "Maximize"}>
        <ToolbarButton
          skin="transparent"
          onClick={handleMaximizeCell}
          aria-label={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <CornersInIcon size={20} />
          ) : (
            <CornersOutIcon size={20} />
          )}
        </ToolbarButton>
      </Tooltip>
      {!isMaximized && (
        <DropdownMenu.Root
          onOpenChange={(o) => {
            setMenuOpen(o)
            moreActionsTooltip.onMenuOpenChange(o)
          }}
        >
          <Tooltip content="More actions" {...moreActionsTooltip.tooltipProps}>
            <DropdownMenu.Trigger asChild>
              <ToolbarButton skin="transparent" aria-label="More actions">
                <DotsThreeVerticalIcon size={20} weight="bold" />
              </ToolbarButton>
            </DropdownMenu.Trigger>
          </Tooltip>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4}>
              {showViewSql && (
                <DropdownMenu.Item
                  onSelect={handleViewSql}
                  icon={<FileSqlIcon size={16} />}
                >
                  View SQL
                </DropdownMenu.Item>
              )}
              {showViewTable && (
                <DropdownMenu.Item
                  onSelect={handleViewTable}
                  icon={
                    isNoneView ? (
                      <PlayIcon size={16} />
                    ) : (
                      <TableIcon size={16} />
                    )
                  }
                >
                  {isNoneView ? "Run" : "View table"}
                </DropdownMenu.Item>
              )}
              {showViewChart && (
                <DropdownMenu.Item
                  onSelect={handleViewChart}
                  icon={<ChartLineIcon size={16} />}
                >
                  {isNoneView ? "Draw" : "View chart"}
                </DropdownMenu.Item>
              )}
              {showSplitItem && (
                <DropdownMenu.Item
                  onSelect={handleToggleMaximizeView}
                  icon={
                    isViewMaximized ? (
                      <ArrowsInLineVerticalIcon size={16} />
                    ) : (
                      <ArrowsOutLineVerticalIcon size={16} />
                    )
                  }
                >
                  {isViewMaximized ? "Split view" : "Maximized view"}
                </DropdownMenu.Item>
              )}

              {groupAHasItems && <DropdownMenu.Divider />}

              {showResetZoom && (
                <DropdownMenu.Item
                  onSelect={handleResetZoom}
                  icon={<Reset size={16} />}
                >
                  Reset zoom
                </DropdownMenu.Item>
              )}
              {showAutoRefreshItem && (
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger>
                    {`Auto-refresh (${autoRefreshLabel(autoRefresh)})`}
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent>
                      <AutoRefreshOptions
                        value={autoRefresh}
                        onSelect={handleRefreshSelect}
                      />
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>
              )}
              {showRefreshItem && (
                <DropdownMenu.Item
                  onSelect={handleRefreshNow}
                  icon={<ArrowClockwiseIcon size={16} />}
                >
                  Refresh now
                </DropdownMenu.Item>
              )}
              {showChartSettings && (
                <DropdownMenu.Item
                  onSelect={handleChartSettings}
                  icon={<GearIcon size={16} />}
                >
                  Chart settings
                </DropdownMenu.Item>
              )}

              {groupBHasItems && <DropdownMenu.Divider />}

              {showMoveUp && (
                <DropdownMenu.Item
                  onSelect={handleMoveUp}
                  icon={<ChevronUp size={16} />}
                >
                  Move up
                </DropdownMenu.Item>
              )}
              {showMoveDown && (
                <DropdownMenu.Item
                  onSelect={handleMoveDown}
                  icon={<ChevronDown size={16} />}
                >
                  Move down
                </DropdownMenu.Item>
              )}
              {showDuplicate && (
                <DropdownMenu.Item
                  onSelect={handleDuplicate}
                  icon={<CopyAlt size={16} />}
                >
                  Duplicate
                </DropdownMenu.Item>
              )}
              {showDelete && (
                <DangerItem onSelect={handleDelete} icon={<Trash size={16} />}>
                  Delete
                </DangerItem>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </ToolbarWrapper>
  )
}
