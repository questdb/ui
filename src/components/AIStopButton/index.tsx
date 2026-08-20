import React from "react"
import styled, { useTheme } from "styled-components"
import { Stop as StopFill } from "../icons"
import { IconButton } from "../IconButton"

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

const StyledButton = styled(IconButton)<{ $size: keyof typeof SIZES }>`
  width: ${({ $size }) => SIZES[$size]};
  min-width: ${({ $size }) => SIZES[$size]};
  height: ${({ $size }) => SIZES[$size]};
  flex-shrink: 0;
  border-radius: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
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
      label={ariaLabel ?? title ?? "Stop"}
      variant="dangerGhost"
      $size={size}
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
      data-hook={dataHook}
      className={className}
    >
      <StopFill size="14px" color={theme.color.statusDangerStrong} />
    </StyledButton>
  )
}
