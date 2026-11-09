import React from "react"
import styled, { css } from "styled-components"
import { Text } from "../../components"
import type { Buffer } from "../../store/buffers"
import { BufferIcon } from "./bufferIcon"

export type LeadingVisibility = "auto" | "visible" | "hidden"

type Props = React.ComponentPropsWithoutRef<"div"> & {
  buffer: Buffer
  active: boolean
  dimmed: boolean
  leading?: React.ReactNode
  leadingVisibility?: LeadingVisibility
  meta?: React.ReactNode
  actions: React.ReactNode
}

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
  opacity: 0.55;
  transition: opacity 0.1s ease;
`

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

const Root = styled.div<{ $active: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-height: 3.2rem;
  padding: 0.3rem 1rem 0.3rem 2.5rem;
  cursor: pointer;
  user-select: none;
  outline: none;

  &:hover,
  &:focus-visible {
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

export const TabRow = ({
  buffer,
  active,
  dimmed,
  leading,
  leadingVisibility = "auto",
  meta,
  actions,
  ...rest
}: Props) => (
  <Root
    $active={active}
    role="button"
    tabIndex={0}
    data-hook="tabs-panel-row"
    data-buffer-id={buffer.id}
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
    <BufferIcon buffer={buffer} />
    <Label color={dimmed ? "contentSecondary" : "contentPrimary"}>
      {buffer.label}
    </Label>
    {meta && <Meta>{meta}</Meta>}
    <Actions onClick={(event) => event.stopPropagation()}>{actions}</Actions>
  </Root>
)
