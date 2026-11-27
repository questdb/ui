import React, { useRef } from "react"
import styled, { css } from "styled-components"
import { Text } from "../../components"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  MenuItem,
} from "../../components/ContextMenu"
import { statusInfoFocus } from "../../theme"
import { RowActions, type TabRowAction } from "./rowActions"

export type LeadingVisibility = "auto" | "visible" | "hidden"

type Props = React.ComponentPropsWithoutRef<"div"> & {
  label: string
  icon: React.ReactNode
  active: boolean
  dimmed: boolean
  disabled: boolean
  meta?: React.ReactNode
  actions?: TabRowAction[]
  // Optional handle in the left gutter (e.g. a drag grip), shown on hover
  // unless the caller pins it visible or hidden.
  leading?: React.ReactNode
  leadingVisibility?: LeadingVisibility
}

const Leading = styled.span<{ $visibility: LeadingVisibility }>`
  position: absolute;
  left: 0;
  width: 2.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  opacity: ${({ $visibility }) => ($visibility === "visible" ? 1 : 0)};
  transition: opacity 0.1s ease;
`

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
`

const Main = styled.div`
  flex: 1;
  min-width: 0;
  align-self: stretch;
  display: flex;
  align-items: center;
  gap: 0.8rem;
`

const Root = styled.div<{ $active: boolean; $disabled: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-height: 3.2rem;
  padding: 0.3rem 1rem 0.3rem 2.5rem;
  cursor: ${({ $disabled }) => ($disabled ? "default" : "pointer")};
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
  user-select: none;

  &:hover {
    background: ${({ theme }) => theme.color.interactionHover};
  }

  &:focus-visible,
  &[data-state="open"] {
    outline: 1px solid ${({ theme }) => statusInfoFocus(theme.color.statusInfo)};
    outline-offset: -1px;
  }

  &:hover ${Leading}[data-visibility="auto"],
  &:focus-within ${Leading}[data-visibility="auto"] {
    opacity: 1;
  }

  ${({ $active, theme }) =>
    $active &&
    css`
      &,
      &:hover {
        background: ${theme.color.interactionNeutral};
        box-shadow: inset 0 0 0 1px ${theme.color.borderDefault};
      }
    `}
`

const Label = styled(Text).attrs({ ellipsis: true })`
  flex: 1;
  min-width: 0;
  font-weight: 500;
`

const Meta = styled.span`
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  white-space: nowrap;
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.color.contentMuted};
`

export const TabRow = ({
  label,
  icon,
  active,
  dimmed,
  disabled,
  meta,
  actions,
  leading,
  leadingVisibility = "auto",
  onKeyDown,
  onClick,
  onPointerDown,
  ...rest
}: Props) => {
  const rowRef = useRef<HTMLDivElement>(null)
  const selectedAction = useRef(false)

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.defaultPrevented) return
    const menuKey =
      event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")
    if (
      actions &&
      menuKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault()
      const row = event.currentTarget
      const { left, bottom } = row.getBoundingClientRect()
      // Anchor the keyboard-opened menu to its row on browsers where
      // Shift+F10 does not dispatch a native contextmenu event.
      row.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: left,
          clientY: bottom,
        }),
      )
      return
    }
    onKeyDown?.(event)
  }

  const row = (
    <Root
      ref={rowRef}
      $active={active}
      $disabled={disabled}
      role="treeitem"
      tabIndex={-1}
      aria-label={label}
      aria-disabled={disabled || undefined}
      aria-current={active ? "page" : undefined}
      aria-haspopup={actions ? "menu" : undefined}
      data-hook="tabs-panel-row"
      data-active={active ? "true" : undefined}
      onClick={disabled ? undefined : onClick}
      onPointerDown={disabled ? undefined : onPointerDown}
      onKeyDown={disabled ? undefined : handleKeyDown}
      {...rest}
    >
      {leading && (
        <Leading
          $visibility={leadingVisibility}
          data-visibility={leadingVisibility}
        >
          {leading}
        </Leading>
      )}
      <Main>
        {icon}
        <Label color={dimmed ? "contentSecondary" : "contentPrimary"}>
          {label}
        </Label>
        {meta && <Meta>{meta}</Meta>}
      </Main>
      {actions && (
        <Actions onClick={(event) => event.stopPropagation()}>
          <RowActions items={actions} />
        </Actions>
      )}
    </Root>
  )

  if (!actions) return row
  return (
    <ContextMenu
      modal={false}
      onOpenChange={(open) => {
        if (open) selectedAction.current = false
      }}
    >
      <ContextMenuTrigger asChild disabled={disabled}>
        {row}
      </ContextMenuTrigger>
      <ContextMenuContent
        aria-label={`${label} actions`}
        onCloseAutoFocus={(event) => {
          // A successful action already moved focus onto another tree item.
          if (
            selectedAction.current &&
            document.activeElement !== document.body
          ) {
            event.preventDefault()
          }
        }}
      >
        {actions.map(({ key, label, icon, disabled, run }) => (
          <MenuItem
            key={key}
            icon={icon}
            disabled={disabled}
            onSelect={() => {
              if (!rowRef.current) return
              selectedAction.current = true
              void run(rowRef.current)
            }}
          >
            {label}
          </MenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}
