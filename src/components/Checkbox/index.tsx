import React, { forwardRef } from "react"
import { Check } from "@phosphor-icons/react"
import styled from "styled-components"
import { statusInfoFocus } from "../../theme"

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  compact?: boolean
}

const Indicator = styled.span<{ $compact: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border: 1px solid ${({ theme }) => theme.color.borderStrong};
  border-radius: 0.4rem;
  background: ${({ theme }) => theme.color.controlSurface};
  color: ${({ theme }) => theme.color.contentInverse};
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    box-shadow 120ms ease;

  svg {
    width: ${({ $compact }) => ($compact ? "1rem" : "1.3rem")};
    height: ${({ $compact }) => ($compact ? "1rem" : "1.3rem")};
    opacity: 0;
    transform: scale(0.72);
    transition:
      opacity 100ms ease,
      transform 120ms ease;
  }
`

const NativeCheckbox = styled.input`
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;

  &:not(:checked):not(:disabled):hover + ${Indicator} {
    background: ${({ theme }) => theme.color.controlSurfaceHover};
  }

  &:checked + ${Indicator} {
    border-color: ${({ theme }) => theme.color.statusInfoControl};
    background: ${({ theme }) => theme.color.statusInfoControl};

    svg {
      opacity: 1;
      transform: scale(1);
    }
  }

  &:checked:not(:disabled):hover + ${Indicator} {
    border-color: ${({ theme }) => theme.color.statusInfoControl};
    background: ${({ theme }) => theme.color.statusInfoControl};
  }

  &:focus-visible + ${Indicator} {
    outline: 1px solid ${({ theme }) => statusInfoFocus(theme.color.statusInfo)};
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
  }

  &:disabled + ${Indicator} {
    opacity: 0.48;
  }
`

const Root = styled.span<{ $compact: boolean }>`
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  width: ${({ $compact }) => ($compact ? "1.4rem" : "1.8rem")};
  height: ${({ $compact }) => ($compact ? "1.4rem" : "1.8rem")};
  vertical-align: middle;
`

export const Checkbox: React.FunctionComponent<Props> = forwardRef<
  HTMLInputElement,
  Props
>(({ compact = false, ...props }, ref) => (
  <Root $compact={compact}>
    <NativeCheckbox ref={ref} type="checkbox" {...props} />
    <Indicator aria-hidden="true" $compact={compact}>
      <Check weight="bold" />
    </Indicator>
  </Root>
))

Checkbox.displayName = "Checkbox"
