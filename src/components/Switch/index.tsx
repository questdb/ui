import React from "react"
import styled from "styled-components"
import * as SwitchPrimitive from "@radix-ui/react-switch"

type Props = {
  className?: string
  disabled?: boolean
  onChange: (checked: boolean) => void
  dataHook?: string
  checked?: boolean
}

const Root = styled(SwitchPrimitive.Root)`
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  padding: 1px;
  width: 36px;
  height: 18px;
  border-radius: 20px;
  border: 0;
  background: transparent;
  appearance: none;
  position: relative;
  transition: 0.2s ease-out;
  cursor: pointer;
  background: ${({ theme }) => theme.color.selection};

  &:focus {
    border-color: #878eb6;
  }

  &[data-state="checked"] {
    background: ${({ theme }) => theme.color.greenDarker};
  }

  &[data-disabled],
  &[data-state="checked"][data-disabled] {
    filter: grayscale(0.8) contrast(0.4);
  }
`

const StyledThumb = styled(SwitchPrimitive.Thumb)`
  display: block;
  width: 16px;
  height: 16px;
  background-color: ${({ theme }) => theme.color.foreground};
  border-radius: 100%;
  transition: transform 100ms linear;
  transform: translateX(0);
  will-change: transform;

  &[data-state="checked"] {
    transform: translateX(18px);
  }

  &[data-disabled] {
    filter: brightness(0.5);
  }

  &[data-state="checked"][data-disabled] {
    filter: brightness(0.8);
  }
`

export const Switch = ({
  checked,
  className,
  disabled,
  onChange,
  dataHook,
}: Props) => (
  <Root
    data-hook={dataHook}
    className={className}
    disabled={disabled}
    onCheckedChange={onChange}
    checked={checked}
  >
    <StyledThumb />
  </Root>
)
