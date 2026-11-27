import React from "react"
import styled from "styled-components"
import { CaretDownIcon } from "@phosphor-icons/react"
import { ButtonBase } from "../../../../components/Button"

// The line box must fit the glyphs: the label's overflow: hidden would clip
// descenders otherwise.
const Root = styled(ButtonBase)`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
  height: 2.8rem;
  padding: 0 0.8rem;
  border: 1px solid transparent;
  border-radius: 0.6rem;
  background: transparent;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.2rem;
  line-height: 1.6rem;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.interactionHover};
    color: ${({ theme }) => theme.color.contentPrimary};
  }

  &[aria-expanded="true"] {
    border-color: ${({ theme }) => theme.color.borderStrong};
    color: ${({ theme }) => theme.color.contentPrimary};
  }

  &:disabled {
    cursor: default;
    color: ${({ theme }) => theme.color.contentDisabled};
  }
`

const Icon = styled.span`
  display: inline-flex;
  flex-shrink: 0;

  svg {
    width: 1.4rem;
    height: 1.4rem;
  }
`

const Label = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Caret = styled(CaretDownIcon)`
  flex-shrink: 0;
  color: ${({ theme }) => theme.color.contentMuted};
`

type ComposerTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ReactNode
  label: React.ReactNode
}

export const ComposerTrigger = React.forwardRef<
  HTMLButtonElement,
  ComposerTriggerProps
>(({ icon, label, ...props }, ref) => (
  <Root ref={ref} {...props}>
    {icon && <Icon>{icon}</Icon>}
    <Label>{label}</Label>
    <Caret size={12} weight="bold" aria-hidden="true" />
  </Root>
))

ComposerTrigger.displayName = "ComposerTrigger"
