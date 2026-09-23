import React from "react"
import styled from "styled-components"
import * as SwitchPrimitive from "@radix-ui/react-switch"
import { statusInfoFocus } from "../../theme"

type Props = {
  className?: string
  disabled?: boolean
  onChange: (checked: boolean) => void
  dataHook?: string
  checked?: boolean
  id?: string
  ariaDescribedBy?: string
  size?: "sm" | "md"
  "aria-label"?: string
}

const track = {
  sm: { width: "36px", height: "18px", radius: "7px", travel: "12px" },
  md: { width: "44px", height: "20px", radius: "8px", travel: "16px" },
} as const

const thumb = {
  sm: { width: "20px", height: "14px", radius: "5px" },
  md: { width: "24px", height: "16px", radius: "6px" },
} as const

const Root = styled(SwitchPrimitive.Root)<{
  $size: "sm" | "md"
}>`
  display: inline-flex;
  align-items: stretch;
  justify-content: flex-start;
  flex-shrink: 0;
  padding: 2px;
  width: ${({ $size }) => track[$size].width};
  height: ${({ $size }) => track[$size].height};
  border-radius: ${({ $size }) => track[$size].radius};
  border: none;
  box-shadow: inset 0 0 0 0.5px ${({ theme }) => theme.color.controlTrackStroke};
  appearance: none;
  position: relative;
  overflow: hidden;
  transition:
    background-color 120ms ease,
    box-shadow 120ms ease,
    opacity 120ms ease;
  cursor: pointer;
  background: ${({ theme }) => theme.color.controlTrackRest};

  &:hover:not([data-disabled]) {
    box-shadow: inset 0 0 0 0.5px
      ${({ theme }) => theme.color.controlTrackStroke};
  }

  &:focus-visible {
    outline: 1px solid ${({ theme }) => statusInfoFocus(theme.color.statusInfo)};
    outline-offset: 2px;
  }

  &[data-state="checked"] {
    background: ${({ theme }) => theme.color.statusSuccessFill};
    box-shadow: inset 0 0 0 0.5px
      ${({ theme }) => theme.color.controlTrackStroke};
  }

  &[data-state="checked"]:hover:not([data-disabled]) {
    background: ${({ theme }) => theme.color.statusSuccessFill};
    box-shadow: inset 0 0 0 0.5px
      ${({ theme }) => theme.color.controlTrackStroke};
  }

  &[data-disabled],
  &[data-state="checked"][data-disabled] {
    cursor: not-allowed;
    opacity: 0.5;
  }
`

const StyledThumb = styled(SwitchPrimitive.Thumb)<{ $size: "sm" | "md" }>`
  display: block;
  width: ${({ $size }) => thumb[$size].width};
  height: ${({ $size }) => thumb[$size].height};
  background-color: ${({ theme }) => theme.color.contentInverse};
  border-radius: ${({ $size }) => thumb[$size].radius};
  transition:
    transform 120ms ease,
    background-color 120ms ease;
  transform: translateX(0);
  will-change: transform;

  &[data-state="checked"] {
    transform: translateX(${({ $size }) => track[$size].travel});
  }

  &[data-disabled] {
    opacity: 0.72;
  }
`

export const Switch = ({
  checked,
  className,
  disabled,
  onChange,
  dataHook,
  id,
  ariaDescribedBy,
  size = "md",
  "aria-label": ariaLabel,
}: Props) => (
  <Root
    data-hook={dataHook}
    className={className}
    disabled={disabled}
    onCheckedChange={onChange}
    checked={checked}
    id={id}
    aria-describedby={ariaDescribedBy}
    aria-label={ariaLabel}
    $size={size}
  >
    <StyledThumb $size={size} />
  </Root>
)
