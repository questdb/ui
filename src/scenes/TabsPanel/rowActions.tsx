import React from "react"
import styled from "styled-components"
import {
  ArrowCounterClockwiseIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react"
import { IconButton, Tooltip } from "../../components"
import type { Buffer } from "../../store/buffers"
import type { RowActionHandlers } from "./useRowActions"

const ROW_ICON_SIZE = 15

const RowIconButton = styled(IconButton).attrs({
  size: "sm",
  variant: "ghost",
})`
  color: ${({ theme }) => theme.color.contentSecondary};

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.color.contentPrimary};
  }
`

const DeleteRowButton = styled(IconButton).attrs({
  size: "sm",
  variant: "dangerQuiet",
})``

type Props = {
  buffer: Buffer
  // From useRowActions, called once per list rather than once per row.
  actions: RowActionHandlers
}

// Close (Reopen for a closed tab) and Delete of a Tabs panel row.
export const RowActions = ({
  buffer,
  actions: { canRemove, tabsDisabled, close, remove, reopen },
}: Props) => (
  <>
    {buffer.archived ? (
      <Tooltip content="Reopen" placement="right">
        <RowIconButton
          label="Reopen tab"
          disabled={tabsDisabled}
          data-hook="tabs-panel-reopen"
          onClick={(event) => void reopen(buffer, event.currentTarget)}
        >
          <ArrowCounterClockwiseIcon size={ROW_ICON_SIZE} />
        </RowIconButton>
      </Tooltip>
    ) : (
      <RowIconButton
        label="Close tab"
        disabled={!canRemove}
        data-hook="tabs-panel-close"
        onClick={(event) => void close(buffer, event.currentTarget)}
      >
        <XIcon size={ROW_ICON_SIZE} />
      </RowIconButton>
    )}
    <DeleteRowButton
      label="Delete tab"
      disabled={buffer.archived ? tabsDisabled : !canRemove}
      data-hook="tabs-panel-delete"
      onClick={(event) => void remove(buffer, event.currentTarget)}
    >
      <TrashIcon size={ROW_ICON_SIZE} />
    </DeleteRowButton>
  </>
)
