import React from "react"
import styled from "styled-components"
import { Plus } from "@styled-icons/boxicons-regular"
import { MarkdownLogoIcon } from "@phosphor-icons/react"
import { color } from "../../../../utils"
import type { CellType } from "../../../../store/notebook"
import { useNotebookActions } from "../NotebookProvider"
import { useEditor } from "../../../../providers/EditorProvider"
import { emitUserAction } from "../../../../utils/notebookAIBridge"

const BottomButton = styled.div<{ $alignCenter?: boolean }>`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.8rem;
  height: ${({ $alignCenter }) => ($alignCenter ? "100%" : "auto")};
  padding: 0.8rem 0;
  margin-top: 1rem;
`

const AddButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 1rem;
  border: none;
  border-radius: 0.3rem;
  background: transparent;
  color: ${color("comment")};
  cursor: pointer;
  font-family: ${({ theme }) => theme.font};

  &:hover {
    color: ${color("foreground")};
    background: ${color("selection")};
  }

  svg {
    width: 1.4rem;
    height: 1.4rem;
  }
`

const BetweenWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 1.2rem;
  position: relative;
  opacity: 0;
  transition: opacity 0.1s;

  &:hover {
    opacity: 1;
  }
`

const BetweenLine = styled.div`
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: ${color("selection")};
`

// Groups the two add buttons and masks the divider line behind them (matching
// the notebook content background).
const BetweenButtons = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0 0.8rem;
  background: ${color("midnight")};
`

// User-origin only: tool-driven add_cell goes through NotebookController directly and doesn't emit here.
const useUserAddCell = () => {
  const { addCell } = useNotebookActions()
  const { activeBuffer } = useEditor()
  return (afterCellId?: string, type?: CellType) => {
    const cellId = addCell(afterCellId, undefined, type)
    if (typeof activeBuffer.id === "number" && cellId) {
      emitUserAction({
        kind: "user_added_cell",
        bufferId: activeBuffer.id,
        cellId,
      })
    }
  }
}

type AddCellBottomProps = {
  alignCenter?: boolean
  afterCellId?: string
}

export const AddCellBottom: React.FC<AddCellBottomProps> = ({
  afterCellId,
  alignCenter = false,
}) => {
  const addCell = useUserAddCell()

  return (
    <BottomButton $alignCenter={alignCenter}>
      <AddButton onClick={() => addCell(afterCellId)}>
        <Plus />
        Add Cell
      </AddButton>
      <AddButton onClick={() => addCell(afterCellId, "markdown")}>
        <MarkdownLogoIcon />
        Add Markdown
      </AddButton>
    </BottomButton>
  )
}

type AddCellBetweenProps = {
  afterCellId: string
}

export const AddCellBetween: React.FC<AddCellBetweenProps> = ({
  afterCellId,
}) => {
  const addCell = useUserAddCell()

  return (
    <BetweenWrapper>
      <BetweenLine />
      <BetweenButtons>
        <AddButton onClick={() => addCell(afterCellId)}>
          <Plus />
          Add Cell
        </AddButton>
        <AddButton onClick={() => addCell(afterCellId, "markdown")}>
          <MarkdownLogoIcon />
          Add Markdown
        </AddButton>
      </BetweenButtons>
    </BetweenWrapper>
  )
}
