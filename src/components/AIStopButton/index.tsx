import React from "react"
import styled, { useTheme } from "styled-components"
import { Stop as StopFill } from "@styled-icons/remix-fill"
import { color } from "../../utils"
import { Button } from "../Button"

type Props = {
  size?: "sm" | "md"
  title?: string
  ariaLabel?: string
  onClick?: () => void
  dataHook?: string
  className?: string
}

const SIZES = {
  sm: "2.2rem",
  md: "2.6rem",
} as const

const StyledButton = styled(Button)<{ $size: keyof typeof SIZES }>`
  width: ${({ $size }) => SIZES[$size]};
  height: ${({ $size }) => SIZES[$size]};
  flex-shrink: 0;
  border-radius: 100%;
  background: ${color("aiStopButtonBg")};
  border: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;

  &:hover {
    background: ${({ theme }) => theme.color.red} !important;
    svg {
      color: ${({ theme }) => theme.color.foreground};
    }
  }
`

export const AIStopButton: React.FC<Props> = ({
  size = "sm",
  title,
  ariaLabel,
  onClick,
  dataHook,
  className,
}) => {
  const theme = useTheme()
  return (
    <StyledButton
      $size={size}
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
      data-hook={dataHook}
      className={className}
    >
      <StopFill size="14px" color={theme.color.aiStopButtonFg} />
    </StyledButton>
  )
}
