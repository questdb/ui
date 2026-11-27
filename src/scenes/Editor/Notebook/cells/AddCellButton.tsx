import React from "react"
import styled, { css } from "styled-components"
import {
  ClipboardTextIcon,
  MarkdownLogoIcon,
  PlusSquareIcon,
} from "@phosphor-icons/react"
import { color } from "../../../../utils"
import { ButtonBase, Tooltip } from "../../../../components"
import type { CellType } from "../../../../store/notebook"
import { MAX_NOTEBOOK_CELLS } from "../../../../store/notebook"
import {
  useNotebookActions,
  useNotebookBufferId,
  useNotebookPreview,
  useNotebookState,
} from "../NotebookProvider"
import { emitUserAction } from "../../../../utils/notebooks/notebookAIBridge"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"
import { useCopiedCells } from "../cellEditing/copiedCellsStore"
import { useCellEditActions } from "../cellEditing/useCellEditActions"

type AddVariant = "primary" | "secondary"
type AddTier = "between" | "bottom"

const BottomButton = styled.div<{ $alignCenter?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  height: ${({ $alignCenter }) => ($alignCenter ? "100%" : "auto")};
  padding: 0.8rem 0;
  margin-top: 1rem;
`

// Add Cell is the primary (pink) action; Add Markdown and Paste Cell stay
// secondary (gray). The "bottom" tier buttons share the row equally (full-width
// click target); the "between" tier is compact and centered on the divider line.
const AddButton = styled(ButtonBase)<{
  $variant: AddVariant
  $tier: AddTier
}>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: none;
  border-radius: 0.3rem;
  background: transparent;
  cursor: pointer;
  font-family: ${({ theme }) => theme.font};
  font-weight: 600;
  color: ${({ $variant }) =>
    $variant === "primary" ? color("contentAccent") : color("contentMuted")};

  ${({ $tier }) =>
    $tier === "bottom"
      ? css`
          flex: 1;
          padding: 0.6rem 1rem;
          font-size: 1.4rem;
          line-height: 2rem;
          svg {
            width: 2rem;
            height: 2rem;
          }
        `
      : css`
          padding: 0.6rem 1rem;
          font-size: 1.2rem;
          line-height: 1.4rem;
          svg {
            width: 1.4rem;
            height: 1.4rem;
          }
        `}

  &:hover {
    ${({ $variant }) =>
      $variant === "primary"
        ? css`
            background: ${color("interactionAccentActive")};
          `
        : css`
            color: ${color("contentPrimary")};
            background: ${color("interactionHover")};
          `}
  }

  &&:disabled {
    cursor: not-allowed;
    opacity: 0.4;

    &:hover {
      color: ${({ $variant }) =>
        $variant === "primary"
          ? color("contentAccent")
          : color("contentMuted")};
      background: transparent;
    }
  }
`

const BetweenWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 1.6rem;
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
  border-top: 1px dashed ${color("borderAccent")};
`

// Groups the add buttons and masks the divider line behind them (matching
// the notebook content background).
const BetweenButtons = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0 0.8rem;
  background: ${color("surfaceStage")};
`

// User-origin only: tool-driven add_cell goes through NotebookController directly and doesn't emit here.
const useUserAddCell = () => {
  const { addCell } = useNotebookActions()
  const { cells } = useNotebookState()
  const bufferId = useNotebookBufferId()
  const atLimit = cells.length >= MAX_NOTEBOOK_CELLS
  const emit = (cellId: string) => {
    if (cellId) {
      emitUserAction({
        kind: "user_added_cell",
        bufferId,
        cellId,
      })
    }
  }
  const add = (afterCellId?: string, type?: CellType) => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_ADD, { cellType: type ?? "sql" })
    if (cells.length + 1 >= MAX_NOTEBOOK_CELLS) {
      void trackEvent(ConsoleEvent.NOTEBOOK_CELL_LIMIT_REACHED)
    }
    emit(addCell(afterCellId, undefined, type))
  }
  return { add, atLimit }
}

const CELL_LIMIT_TITLE = `Notebook limit of ${MAX_NOTEBOOK_CELLS} cells reached`

type AddActionProps = {
  icon: React.ReactNode
  label: string
  variant: AddVariant
  tier: AddTier
  atLimit: boolean
  onClick: () => void
}

const AddAction: React.FC<AddActionProps> = ({
  icon,
  label,
  variant,
  tier,
  atLimit,
  onClick,
}) => {
  const button = (
    <AddButton
      $variant={variant}
      $tier={tier}
      onClick={onClick}
      disabled={atLimit}
    >
      {icon}
      {label}
    </AddButton>
  )
  if (!atLimit) return button
  // The span lets the tooltip fire on a disabled button, which gets no pointer
  // events; it also carries the flex so the bottom tier keeps its equal share.
  return (
    <Tooltip content={CELL_LIMIT_TITLE}>
      <span
        style={{
          display: "inline-flex",
          flex: tier === "bottom" ? 1 : undefined,
        }}
      >
        {button}
      </span>
    </Tooltip>
  )
}

type PasteCellActionProps = {
  afterCellId?: string
  tier: AddTier
  atLimit: boolean
}

const PasteCellAction: React.FC<PasteCellActionProps> = ({
  afterCellId,
  tier,
  atLimit,
}) => {
  const copiedCells = useCopiedCells()
  const { pasteCells } = useCellEditActions()
  const preview = useNotebookPreview()

  if (!copiedCells || preview) return null

  return (
    <AddAction
      icon={<ClipboardTextIcon />}
      label="Paste Cell"
      variant="secondary"
      tier={tier}
      atLimit={atLimit}
      onClick={() => pasteCells(copiedCells, afterCellId, "button")}
    />
  )
}

type AddCellBottomProps = {
  alignCenter?: boolean
  afterCellId?: string
}

export const AddCellBottom: React.FC<AddCellBottomProps> = ({
  afterCellId,
  alignCenter = false,
}) => {
  const { add, atLimit } = useUserAddCell()

  return (
    <BottomButton $alignCenter={alignCenter}>
      <AddAction
        icon={<PlusSquareIcon />}
        label="Add Cell"
        variant="primary"
        tier="bottom"
        atLimit={atLimit}
        onClick={() => add(afterCellId)}
      />
      <AddAction
        icon={<MarkdownLogoIcon />}
        label="Add Markdown"
        variant="secondary"
        tier="bottom"
        atLimit={atLimit}
        onClick={() => add(afterCellId, "markdown")}
      />
      <PasteCellAction tier="bottom" atLimit={atLimit} />
    </BottomButton>
  )
}

type AddCellBetweenProps = {
  afterCellId: string
}

export const AddCellBetween: React.FC<AddCellBetweenProps> = ({
  afterCellId,
}) => {
  const { add, atLimit } = useUserAddCell()

  return (
    <BetweenWrapper>
      <BetweenLine />
      <BetweenButtons>
        <AddAction
          icon={<PlusSquareIcon />}
          label="Add Cell"
          variant="primary"
          tier="between"
          atLimit={atLimit}
          onClick={() => add(afterCellId)}
        />
        <AddAction
          icon={<MarkdownLogoIcon />}
          label="Add Markdown"
          variant="secondary"
          tier="between"
          atLimit={atLimit}
          onClick={() => add(afterCellId, "markdown")}
        />
        <PasteCellAction
          afterCellId={afterCellId}
          tier="between"
          atLimit={atLimit}
        />
      </BetweenButtons>
    </BetweenWrapper>
  )
}
