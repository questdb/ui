import React from "react"
import styled, { css, keyframes } from "styled-components"
import type { DefaultTheme } from "styled-components"
import { withAlpha } from "../../theme"

export enum BadgeType {
  SUCCESS = "success",
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
  DISABLED = "disabled",
}

export const badgeVariants = [
  "neutral",
  "accent",
  "info",
  "success",
  "warning",
  "danger",
] as const

export type BadgeVariant = (typeof badgeVariants)[number]

type Props = {
  type?: BadgeType
  variant?: BadgeVariant
  size?: "sm" | "md"
  icon?: React.ReactNode
  pulsate?: boolean
  children?: React.ReactNode
  className?: string
  "data-hook"?: string
}

const pulsate = keyframes`
  0% {
    opacity: 0.075;
  }
  
  50% {
    opacity: 0.3;
  }

  100% {
    opacity: 0.075;
  }
`

const getVariant = (variant?: BadgeVariant, type?: BadgeType): BadgeVariant => {
  if (variant) return variant
  if (type === BadgeType.SUCCESS) return "success"
  if (type === BadgeType.WARNING) return "warning"
  if (type === BadgeType.ERROR) return "danger"
  if (type === BadgeType.INFO) return "info"
  return "neutral"
}

const getTone = (variant: BadgeVariant, theme: DefaultTheme) => {
  const tones = {
    neutral: theme.color.contentSecondary,
    accent: theme.color.contentAccent,
    info: theme.color.statusInfo,
    success: theme.color.statusSuccess,
    warning: theme.color.statusWarning,
    danger: theme.color.statusDanger,
  }
  return tones[variant]
}

const Root = styled.span<{
  $variant: BadgeVariant
  $size: "sm" | "md"
  pulsate?: boolean
}>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  gap: 0.5rem;
  height: ${({ $size }) => ($size === "sm" ? "2.2rem" : "2.8rem")};
  padding: ${({ $size }) => ($size === "sm" ? "0 0.7rem" : "0 0.9rem")};
  border: 1px solid
    ${({ $variant, theme }) => withAlpha(getTone($variant, theme), 0.32)};
  border-radius: 999px;
  color: ${({ $variant, theme }) => getTone($variant, theme)};
  background: ${({ $variant, theme }) =>
    withAlpha(getTone($variant, theme), 0.1)};
  font-size: ${({ theme }) => theme.fontSize.xs};
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;

  ${(props) =>
    props.pulsate &&
    css`
      &:after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: currentColor;
        animation: ${pulsate} 3s linear infinite;
      }
    `};
`

const Icon = styled.div<{ hasGap: boolean }>`
  display: flex;
  justify-content: center;
  align-items: center;

  ${({ hasGap }) => !hasGap && "margin: 0 -0.1rem;"}

  svg {
    width: 1.4rem;
    height: 1.4rem;
  }
`

export const Badge: React.FunctionComponent<Props> = ({
  type,
  variant,
  size = "md",
  icon,
  pulsate,
  children,
  className,
  "data-hook": dataHook,
}) => (
  <Root
    className={className}
    $variant={getVariant(variant, type)}
    $size={size}
    pulsate={pulsate}
    data-hook={dataHook}
  >
    {icon && <Icon hasGap={React.Children.count(children) > 0}>{icon}</Icon>}
    {children}
  </Root>
)
