import React, { useState } from "react"
import styled, { css } from "styled-components"
import {
  ChevronUp,
  ChevronDown,
  CopyAlt,
  Trash,
} from "@styled-icons/boxicons-regular"
import {
  DotsThreeVerticalIcon,
  CornersOutIcon,
  CornersInIcon,
  ArrowClockwiseIcon,
  GearIcon,
} from "@phosphor-icons/react"
import { DropdownMenu, Button, Tooltip } from "../../../../components"
import { Switch } from "../../../../components/Switch"
import { MAX_NOTEBOOK_CELLS } from "../../../../store/notebook"
import { useNotebookActions, useNotebookState } from "../NotebookProvider"
import { useEditor } from "../../../../providers/EditorProvider"
import {
  emitUserAction,
  signalUserEdit,
} from "../../../../utils/notebookAIBridge"

const ToolbarWrapper = styled.div<{
  $inline?: boolean
  $forceVisible?: boolean
}>`
  display: flex;
  align-items: center;
  gap: 0.5rem;

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

const IconWrapper = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
`

const ChartControlRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 1rem;
  font-size: 1.4rem;
  color: ${({ theme }) => theme.color.foreground};
  user-select: none;
`

type ChartControls = {
  autoRefresh: boolean
  onAutoRefreshChange: (value: boolean) => void
  onManualRefresh: () => void
  onOpenSettings: () => void
}

type Props = {
  cellId: string
  inline?: boolean
  chartControls?: ChartControls
}

export const CellToolbar: React.FC<Props> = ({
  cellId,
  inline,
  chartControls,
}) => {
  const {
    moveCellUp,
    moveCellDown,
    duplicateCell,
    deleteCell,
    setMaximizedCellId,
  } = useNotebookActions()
  const { cells, maximizedCellId, settings } = useNotebookState()
  const cellIndex = cells.findIndex((c) => c.id === cellId)
  const totalCells = cells.length
  // Grid mode positions cells via settings.layout[i].{x,y,w,h}, so swapping array
  // order doesn't move them visually — hide move up/down in grid mode.
  const isGridMode = settings.layoutMode === "grid"
  const { activeBuffer } = useEditor()

  const isMaximized = maximizedCellId === cellId
  const [menuOpen, setMenuOpen] = useState(false)

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
        <Button
          skin="transparent"
          onClick={() => {
            signalUserEdit()
            setMaximizedCellId(isMaximized ? null : cellId)
          }}
          aria-label={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <CornersInIcon size={20} />
          ) : (
            <CornersOutIcon size={20} />
          )}
        </Button>
      </Tooltip>
      {!isMaximized && (
        <DropdownMenu.Root onOpenChange={setMenuOpen}>
          <Tooltip content="More actions">
            <DropdownMenu.Trigger asChild>
              <Button skin="transparent" aria-label="More actions">
                <DotsThreeVerticalIcon size={20} weight="bold" />
              </Button>
            </DropdownMenu.Trigger>
          </Tooltip>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4}>
              {chartControls && (
                <>
                  <ChartControlRow>
                    Auto-refresh
                    <Switch
                      checked={chartControls.autoRefresh}
                      onChange={chartControls.onAutoRefreshChange}
                    />
                  </ChartControlRow>
                  <DropdownMenu.Item
                    disabled={chartControls.autoRefresh}
                    onSelect={chartControls.onManualRefresh}
                  >
                    <IconWrapper>
                      <ArrowClockwiseIcon size={16} />
                    </IconWrapper>
                    Refresh
                  </DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={chartControls.onOpenSettings}>
                    <IconWrapper>
                      <GearIcon size={16} />
                    </IconWrapper>
                    Chart settings
                  </DropdownMenu.Item>
                  <DropdownMenu.Divider />
                </>
              )}
              {!isGridMode && (
                <>
                  <DropdownMenu.Item
                    disabled={cellIndex === 0}
                    onSelect={handleMoveUp}
                  >
                    <IconWrapper>
                      <ChevronUp size={16} />
                    </IconWrapper>
                    Move up
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    disabled={cellIndex === totalCells - 1}
                    onSelect={handleMoveDown}
                  >
                    <IconWrapper>
                      <ChevronDown size={16} />
                    </IconWrapper>
                    Move down
                  </DropdownMenu.Item>
                </>
              )}
              <DropdownMenu.Item
                disabled={totalCells >= MAX_NOTEBOOK_CELLS}
                onSelect={handleDuplicate}
              >
                <IconWrapper>
                  <CopyAlt size={16} />
                </IconWrapper>
                Duplicate
              </DropdownMenu.Item>
              <DropdownMenu.Item
                disabled={totalCells <= 1}
                onSelect={handleDelete}
              >
                <IconWrapper>
                  <Trash size={16} />
                </IconWrapper>
                Delete
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </ToolbarWrapper>
  )
}
