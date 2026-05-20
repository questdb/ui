import React from "react"
import styled from "styled-components"
import { Plus } from "@styled-icons/boxicons-regular"
import { color } from "../../../../utils"
import { useNotebookActions } from "../NotebookProvider"
import { useEditor } from "../../../../providers/EditorProvider"
import { emitUserAction } from "../../../../utils/notebookAIBridge"

const BottomButton = styled.div<{ $alignCenter?: boolean }>`
  display: flex;
  justify-content: center;
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

const BetweenButton = styled.button`
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  height: 1.8rem;
  border: 1px solid ${color("selection")};
  border-radius: 50%;
  background: ${color("editorBackground")};
  color: ${color("comment")};
  cursor: pointer;
  padding: 0;

  &:hover {
    border-color: ${color("comment")};
    color: ${color("foreground")};
  }
`

// User-origin only: tool-driven add_cell goes through NotebookController directly and doesn't emit here.
const useUserAddCell = () => {
  const { addCell } = useNotebookActions()
  const { activeBuffer } = useEditor()
  return (afterCellId?: string) => {
    const cellId = addCell(afterCellId)
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
      <BetweenButton onClick={() => addCell(afterCellId)} aria-label="Add cell">
        <Plus size={16} />
      </BetweenButton>
    </BetweenWrapper>
  )
}
