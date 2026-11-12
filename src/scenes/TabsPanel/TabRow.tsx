import React from "react"
import styled, { css } from "styled-components"
import { Text } from "../../components"

export type LeadingVisibility = "auto" | "visible" | "hidden"

type Props = React.ComponentPropsWithoutRef<"div"> & {
  label: string
  icon: React.ReactNode
  active: boolean
  dimmed: boolean
  meta?: React.ReactNode
  actions?: React.ReactNode
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

// The activatable part of the row: icon, label and meta. It is the row's
// button; the Close/Delete/Reopen actions are its siblings, so each stays a
// separate control for assistive technology.
const Main = styled.div`
  flex: 1;
  min-width: 0;
  align-self: stretch;
  display: flex;
  align-items: center;
  gap: 0.8rem;
`

const Root = styled.div<{ $active: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-height: 3.2rem;
  padding: 0.3rem 1rem 0.3rem 2.5rem;
  cursor: pointer;
  user-select: none;

  &:hover {
    background: ${({ theme }) => theme.color.interactionHover};
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

// One row of the Tabs panel. The icon, label and meta form the row's button
// (it takes focus and `onKeyDown`); the actions sit next to it, not inside it,
// since a button cannot contain other controls. A click anywhere on the row
// except an action activates it, as the mouse expects.
export const TabRow = ({
  label,
  icon,
  active,
  dimmed,
  meta,
  actions,
  leading,
  leadingVisibility = "auto",
  onKeyDown,
  ...rest
}: Props) => (
  <Root
    $active={active}
    data-hook="tabs-panel-row"
    data-active={active ? "true" : undefined}
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
    <Main
      role="button"
      tabIndex={0}
      aria-current={active ? "page" : undefined}
      data-hook="tabs-panel-row-button"
      onKeyDown={onKeyDown}
    >
      {icon}
      <Label color={dimmed ? "contentSecondary" : "contentPrimary"}>
        {label}
      </Label>
      {meta && <Meta>{meta}</Meta>}
    </Main>
    {actions && (
      <Actions onClick={(event) => event.stopPropagation()}>{actions}</Actions>
    )}
  </Root>
)
