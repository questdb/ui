import React, { useState } from "react"
import styled, { css } from "styled-components"
import {
  ChevronUp,
  ChevronDown,
  CopyAlt,
  Trash,
  Reset,
} from "../../../../components/icons"
import {
  DotsThreeVerticalIcon,
  CornersOutIcon,
  CornersInIcon,
  ArrowClockwiseIcon,
  GearIcon,
  TableIcon,
  ChartLineIcon,
  PlayIcon,
  FileSqlIcon,
} from "@phosphor-icons/react"
import { DropdownMenu, IconButton, Tooltip } from "../../../../components"
import { AutoRefreshOptions } from "./AutoRefreshOptions"
import { useTriggerTooltip } from "./useTriggerTooltip"
import {
  autoRefreshLabel,
  cellToolbarMenuFlags,
  resolveAutoRefresh,
  resolveCellView,
} from "../notebookUtils"
import type { CellPaneLayout, CellToolbarTier } from "../notebookUtils"
import type { AutoRefresh, NotebookCell } from "../../../../store/notebook"
import { useNotebookActions, useNotebookBufferId } from "../NotebookProvider"
import { useCellFetchState } from "../cellRefresh/CellRefreshContext"
import {
  emitUserAction,
  signalUserEdit,
} from "../../../../utils/notebooks/notebookAIBridge"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import { clearChartZoom } from "../cellVirtualization/chartZoomStore"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"

const ToolbarWrapper = styled.div<{
  $inline?: boolean
  $forceVisible?: boolean
}>`
  display: flex;
  align-items: center;
  gap: 0.8rem;
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

type Props = {
  cellId: string
  cell: NotebookCell
  cellIndex: number
  totalCells: number
  layoutMode: "list" | "grid"
  autoRefreshDefault?: AutoRefresh
  isMaximized: boolean
  isRunning?: boolean
  inline?: boolean
  toolbarTier?: CellToolbarTier
  paneLayout?: CellPaneLayout
  chartZoomed?: boolean
}

export const CellToolbar: React.FC<Props> = ({
  cellId,
  cell,
  cellIndex,
  totalCells,
  layoutMode,
  autoRefreshDefault,
  isMaximized,
  isRunning = false,
  inline,
  toolbarTier,
  paneLayout,
  chartZoomed = false,
}) => {
  const {
    moveCellUp,
    moveCellDown,
    duplicateCell,
    deleteCell,
    setFocusedCell,
    setMaximizedCellId,
    setCellRefresh,
    setCellPaneView,
    setCellMode,
    clearCellResult,
  } = useNotebookActions()
  const bufferId = useNotebookBufferId()

  // Grid positions cells via settings.layout, so swapping array order doesn't
  // move them visually — hide move up/down there.
  const isGridMode = layoutMode === "grid"
  // Markdown cells have no run/draw views — keep their menu to move/dup/delete.
  const isMarkdown = cell.type === "markdown"
  const view = resolveCellView(cell)
  const isChartView = view === "chart"
  const isGridView = view === "grid"
  const isNoneView = view === "none"
  const resultOnly = paneLayout === "result"
  const autoRefresh = resolveAutoRefresh(cell.autoRefresh, autoRefreshDefault)
  // A write cell never ticks, so the menu must not offer an interval the
  // engine would ignore — same gate the inline selector applies.
  const autoRefreshBlocked =
    useCellFetchState(cellId)?.classifyBlock?.kind === "write"
  const [menuOpen, setMenuOpen] = useState(false)
  const moreActionsTooltip = useTriggerTooltip()

  const {
    showViewTable,
    showViewChart,
    showEditorToggleItem,
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
    chartZoomed,
    isGridMode,
    cellIndex,
    totalCells,
  })

  // Unchecking the active table wipes the result — the same gesture as
  // toggling off the wide tiers' Table segment. A chart transfers its data to
  // the grid (no re-query) when switching.
  const handleViewTable = () => {
    if (isRunning) return
    signalUserEdit(bufferId)
    if (isNoneView) {
      eventBus.publish(EventType.NOTEBOOK_CELL_RUN, { cellId })
      return
    }
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_VIEW_CHANGE, {
      to: isGridView ? "none" : "grid",
      method: "menu",
    })
    if (isGridView) {
      clearCellResult(cellId)
      return
    }
    setCellMode(cellId, "run")
  }
  // The DRAW event toggles: it enters draw, or exits and wipes when the chart
  // is already active — matching the wide tiers' Chart segment.
  const handleViewChart = () => {
    if (isRunning) return
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_VIEW_CHANGE, {
      to: isChartView ? "none" : "chart",
      method: "menu",
    })
    signalUserEdit(bufferId)
    eventBus.publish(EventType.NOTEBOOK_CELL_DRAW, { cellId })
  }
  const handleToggleEditor = () => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_EDITOR_TOGGLE, {
      editorShown: resultOnly,
      view,
    })
    signalUserEdit(bufferId)
    setCellPaneView(cellId, resultOnly ? "editor_result" : "result")
  }
  const handleMaximizeCell = () => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_MAXIMIZE, {
      action: isMaximized ? "restore" : "maximize",
      cellType: cell.type ?? "sql",
    })
    signalUserEdit(bufferId)
    setMaximizedCellId(isMaximized ? null : cellId)
  }
  const handleRefreshNow = () => {
    signalUserEdit(bufferId)
    if (isChartView) {
      void trackEvent(ConsoleEvent.NOTEBOOK_CELL_DRAW)
      eventBus.publish(EventType.NOTEBOOK_CELL_REFRESH_CHART, { cellId })
      return
    }
    eventBus.publish(EventType.NOTEBOOK_CELL_RUN, { cellId })
  }
  const handleResetZoom = () => {
    clearChartZoom(cellId)
    eventBus.publish(EventType.NOTEBOOK_CELL_RESET_ZOOM, { cellId })
  }
  const handleChartSettings = () => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CHART_SETTINGS_OPEN, {
      chartType: cell.chartConfig?.queries.find((q) => q != null)?.type,
    })
    eventBus.publish(EventType.NOTEBOOK_CELL_OPEN_CHART_SETTINGS, { cellId })
  }
  const handleRefreshSelect = (value: AutoRefresh | undefined) => {
    if (value === cell.autoRefresh) return
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_AUTOREFRESH_CHANGE, {
      from: autoRefreshLabel(autoRefresh),
      to: value === undefined ? "default" : autoRefreshLabel(value),
      trigger: "menu",
    })
    signalUserEdit(bufferId)
    setCellRefresh(cellId, value)
  }

  const handleMoveUp = () => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_MOVE, { method: "menu" })
    moveCellUp(cellId)
    emitUserAction({ kind: "user_moved_cell", bufferId, cellId })
  }
  const handleMoveDown = () => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_MOVE, { method: "menu" })
    moveCellDown(cellId)
    emitUserAction({ kind: "user_moved_cell", bufferId, cellId })
  }
  const handleDuplicate = async () => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_DUPLICATE, {
      cellType: cell.type ?? "sql",
      view,
    })
    const newCellId = await duplicateCell(cellId)
    if (newCellId) {
      setFocusedCell(newCellId)
      emitUserAction({
        kind: "user_duplicated_cell",
        bufferId,
        cellId,
        newCellId,
      })
    }
  }
  const handleDelete = () => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_DELETE, {
      cellType: cell.type ?? "sql",
    })
    deleteCell(cellId)
    emitUserAction({ kind: "user_deleted_cell", bufferId, cellId })
  }

  return (
    <ToolbarWrapper
      className="cell-toolbar"
      $inline={inline}
      $forceVisible={menuOpen}
    >
      <Tooltip content={isMaximized ? "Restore" : "Maximize"}>
        <IconButton
          label={isMaximized ? "Restore" : "Maximize"}
          variant="ghost"
          onClick={handleMaximizeCell}
        >
          {isMaximized ? (
            <CornersInIcon size={20} />
          ) : (
            <CornersOutIcon size={20} />
          )}
        </IconButton>
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
              <IconButton label="More actions" variant="ghost">
                <DotsThreeVerticalIcon size={20} weight="bold" />
              </IconButton>
            </DropdownMenu.Trigger>
          </Tooltip>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4}>
              {showViewTable &&
                (isNoneView ? (
                  <DropdownMenu.Item
                    onSelect={handleViewTable}
                    disabled={isRunning}
                    icon={<PlayIcon size={16} />}
                  >
                    Run
                  </DropdownMenu.Item>
                ) : (
                  <DropdownMenu.CheckboxItem
                    checked={isGridView}
                    onSelect={handleViewTable}
                    disabled={isRunning}
                    icon={<TableIcon size={16} />}
                  >
                    View table
                  </DropdownMenu.CheckboxItem>
                ))}
              {showViewChart &&
                (isNoneView ? (
                  <DropdownMenu.Item
                    onSelect={handleViewChart}
                    disabled={isRunning}
                    icon={<ChartLineIcon size={16} />}
                  >
                    Draw
                  </DropdownMenu.Item>
                ) : (
                  <DropdownMenu.CheckboxItem
                    checked={isChartView}
                    onSelect={handleViewChart}
                    disabled={isRunning}
                    icon={<ChartLineIcon size={16} />}
                  >
                    View chart
                  </DropdownMenu.CheckboxItem>
                ))}
              {showEditorToggleItem && (
                <DropdownMenu.CheckboxItem
                  checked={!resultOnly}
                  onSelect={handleToggleEditor}
                  icon={<FileSqlIcon size={16} />}
                >
                  Show editor
                </DropdownMenu.CheckboxItem>
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
                  <DropdownMenu.SubTrigger disabled={autoRefreshBlocked}>
                    {autoRefreshBlocked
                      ? "Auto-refresh (contains DDL/DML)"
                      : `Auto-refresh (${autoRefreshLabel(autoRefresh)})`}
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent>
                      <AutoRefreshOptions
                        value={cell.autoRefresh}
                        onSelect={handleRefreshSelect}
                        inheritedValue={resolveAutoRefresh(
                          undefined,
                          autoRefreshDefault,
                        )}
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
                <DropdownMenu.Item
                  tone="danger"
                  onSelect={handleDelete}
                  icon={<Trash size={16} />}
                >
                  Delete
                </DropdownMenu.Item>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </ToolbarWrapper>
  )
}
