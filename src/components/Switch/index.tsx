import React from "react"
import styled from "styled-components"
import * as SwitchPrimitive from "@radix-ui/react-switch"

type Props = {
  className?: string
  disabled?: boolean
  onChange: (checked: boolean) => void
  dataHook?: string
  checked?: boolean
  id?: string
  ariaDescribedBy?: string
  tone?: "accent" | "success"
  size?: "sm" | "md"
  "aria-label"?: string
}

const Root = styled(SwitchPrimitive.Root)<{
  $tone: "accent" | "success"
  $size: "sm" | "md"
}>`
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  padding: 2px;
  width: ${({ $size }) => ($size === "sm" ? "32px" : "36px")};
  height: ${({ $size }) => ($size === "sm" ? "18px" : "20px")};
  border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.color.borderSubtle};
  appearance: none;
  position: relative;
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    opacity 120ms ease;
  cursor: pointer;
  background: ${({ theme }) => theme.color.controlTrack};

  &:hover:not([data-disabled]) {
    border-color: ${({ theme }) => theme.color.borderAccent};
  }

  &:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.contentAccent};
    outline-offset: 2px;
  }

  &[data-state="checked"] {
    background: ${({ $tone, theme }) =>
      $tone === "success"
        ? theme.color.statusSuccessStrong
        : theme.color.contentAccent};
    border-color: ${({ $tone, theme }) =>
      $tone === "success"
        ? theme.color.statusSuccess
        : theme.color.contentAccent};
  }

  &[data-state="checked"]:hover:not([data-disabled]) {
    background: ${({ $tone, theme }) =>
      $tone === "success"
        ? theme.color.statusSuccessStrong
        : theme.color.contentAccentStrong};
    border-color: ${({ $tone, theme }) =>
      $tone === "success"
        ? theme.color.statusSuccess
        : theme.color.contentAccentStrong};
  }

  &[data-disabled],
  &[data-state="checked"][data-disabled] {
    cursor: not-allowed;
    opacity: 0.5;
  }
`

const StyledThumb = styled(SwitchPrimitive.Thumb)<{ $size: "sm" | "md" }>`
  display: block;
  width: ${({ $size }) => ($size === "sm" ? "12px" : "14px")};
  height: ${({ $size }) => ($size === "sm" ? "12px" : "14px")};
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  background-color: ${({ theme }) => theme.color.controlKnob};
  border-radius: 100%;
  box-shadow: 0 1px 3px ${({ theme }) => theme.color.shadowSoft};
  transition:
    transform 120ms ease,
    background-color 120ms ease;
  transform: translateX(0);
  will-change: transform;

  &[data-state="checked"] {
    background-color: ${({ theme }) => theme.color.contentInverse};
    transform: translateX(16px);
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
  tone = "accent",
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
    $tone={tone}
    $size={size}
  >
    <StyledThumb $size={size} />
  </Root>
)
