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
} from "@phosphor-icons/react"
import { DropdownMenu, Button } from "../../../../components"
import { useNotebookActions, useNotebookState } from "../NotebookProvider"
import { useEditor } from "../../../../providers/EditorProvider"
import { emitUserAction } from "../../../../utils/notebookAIBridge"

const ToolbarWrapper = styled.div<{
  $inline?: boolean
  $forceVisible?: boolean
}>`
  display: flex;
  align-items: center;

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

type Props = {
  cellId: string
  inline?: boolean
}

export const CellToolbar: React.FC<Props> = ({ cellId, inline }) => {
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
      <Button
        skin="transparent"
        onClick={() => setMaximizedCellId(isMaximized ? null : cellId)}
        title={isMaximized ? "Restore" : "Maximize"}
      >
        {isMaximized ? (
          <CornersInIcon size={20} />
        ) : (
          <CornersOutIcon size={20} />
        )}
      </Button>
      {!isMaximized && (
        <DropdownMenu.Root onOpenChange={setMenuOpen}>
          <DropdownMenu.Trigger asChild>
            <Button skin="transparent">
              <DotsThreeVerticalIcon size={20} weight="bold" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4}>
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
              <DropdownMenu.Item onSelect={handleDuplicate}>
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
