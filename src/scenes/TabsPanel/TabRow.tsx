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
  opacity: 0.55;
  transition: opacity 0.1s ease;
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

  &:hover ${Actions},
  &:focus-within ${Actions},
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

      ${Actions} {
        opacity: 1;
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

// One row of the Tabs panel. The row itself is the primary action (button);
// callers wrap it in the list item so nested Close/Delete buttons keep their
// own semantics.
export const TabRow = ({
  label,
  icon,
  active,
  dimmed,
  meta,
  actions,
  leading,
  leadingVisibility = "auto",
  ...rest
}: Props) => (
  <Root
    $active={active}
    role="button"
    tabIndex={0}
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
    {icon}
    <Label color={dimmed ? "contentSecondary" : "contentPrimary"}>
      {label}
    </Label>
    {meta && <Meta>{meta}</Meta>}
    {actions && (
      <Actions onClick={(event) => event.stopPropagation()}>{actions}</Actions>
    )}
  </Root>
)
