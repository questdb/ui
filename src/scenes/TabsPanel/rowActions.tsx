import React from "react"
import styled, { css } from "styled-components"
import {
  ArrowCounterClockwiseIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react"
import { IconButton, Tooltip } from "../../components"
import type { Buffer } from "../../store/buffers"
import type { RowActionHandlers } from "./useRowActions"

const ROW_ICON_SIZE = 15

const RowIconButton = styled(IconButton).attrs({ size: "sm" })<{
  $danger: boolean
}>`
  ${({ $danger, theme }) =>
    !$danger &&
    css`
      color: ${theme.color.contentSecondary};

      &:hover:not(:disabled) {
        color: ${theme.color.contentPrimary};
      }
    `}
`

export type TabRowAction = {
  key: "close" | "reopen" | "delete"
  label: string
  disabled: boolean
  icon: React.ReactNode
  run: (origin: Element) => Promise<void>
}

export const getTabRowActions = (
  buffer: Buffer,
  { canRemove, tabsDisabled, close, remove, reopen }: RowActionHandlers,
): TabRowAction[] => [
  buffer.archived
    ? {
        key: "reopen",
        label: "Reopen tab",
        disabled: tabsDisabled,
        icon: <ArrowCounterClockwiseIcon size={ROW_ICON_SIZE} />,
        run: (origin) => reopen(buffer, origin),
      }
    : {
        key: "close",
        label: "Close tab",
        disabled: !canRemove,
        icon: <XIcon size={ROW_ICON_SIZE} />,
        run: (origin) => close(buffer, origin),
      },
  {
    key: "delete",
    label: "Delete tab",
    disabled: buffer.archived ? tabsDisabled : !canRemove,
    icon: <TrashIcon size={ROW_ICON_SIZE} />,
    run: (origin) => remove(buffer, origin),
  },
]

export const RowActions = ({ items }: { items: TabRowAction[] }) => (
  <>
    {items.map(({ key, label, disabled, icon, run }) => {
      const danger = key === "delete"
      const button = (
        <RowIconButton
          key={key}
          $danger={danger}
          variant={danger ? "dangerQuiet" : "ghost"}
          label={label}
          disabled={disabled}
          tabIndex={-1}
          data-hook={`tabs-panel-${key}`}
          onClick={(event) => void run(event.currentTarget)}
        >
          {icon}
        </RowIconButton>
      )
      return key === "reopen" ? (
        <Tooltip key={key} content="Reopen" placement="right">
          {button}
        </Tooltip>
      ) : (
        button
      )
    })}
  </>
)
