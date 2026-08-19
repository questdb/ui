import React, { forwardRef } from "react"
import { Check } from "@phosphor-icons/react"
import styled from "styled-components"

type Props = React.InputHTMLAttributes<HTMLInputElement>

const Indicator = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  height: 1.8rem;
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
    width: 1.3rem;
    height: 1.3rem;
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
    border-color: ${({ theme }) => theme.color.borderAccentStrong};
    background: ${({ theme }) => theme.color.controlSurfaceHover};
  }

  &:checked + ${Indicator} {
    border-color: ${({ theme }) => theme.color.contentAccent};
    background: ${({ theme }) => theme.color.contentAccent};

    svg {
      opacity: 1;
      transform: scale(1);
    }
  }

  &:checked:not(:disabled):hover + ${Indicator} {
    border-color: ${({ theme }) => theme.color.contentAccentStrong};
    background: ${({ theme }) => theme.color.contentAccentStrong};
  }

  &:focus-visible + ${Indicator} {
    border-color: ${({ theme }) => theme.color.actionPrimaryHover};
    box-shadow: 0 0 0 0.2rem
      ${({ theme }) => theme.color.interactionAccentActive};
  }

  &:disabled {
    cursor: not-allowed;
  }

  &:disabled + ${Indicator} {
    opacity: 0.48;
  }
`

const Root = styled.span`
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  width: 1.8rem;
  height: 1.8rem;
  vertical-align: middle;
`

export const Checkbox: React.FunctionComponent<Props> = forwardRef<
  HTMLInputElement,
  Props
>((props, ref) => (
  <Root>
    <NativeCheckbox ref={ref} type="checkbox" {...props} />
    <Indicator aria-hidden="true">
      <Check weight="bold" />
    </Indicator>
  </Root>
))

Checkbox.displayName = "Checkbox"
