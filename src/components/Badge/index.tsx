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

export type BadgeSize = "sm" | "md"
export type BadgeShape = "chip" | "pill"

type Props = React.ComponentPropsWithoutRef<"span"> & {
  type?: BadgeType
  variant?: BadgeVariant
  size?: BadgeSize
  /** `chip` is the default status badge. `pill` is reserved for compact count badges. */
  shape?: BadgeShape
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

const chipBackground = (variant: BadgeVariant, theme: DefaultTheme) => {
  switch (variant) {
    case "success":
      return theme.color.statusSuccessSurface
    case "danger":
      return theme.color.statusDangerSurface
    case "warning":
      return theme.color.statusWarningSurface
    case "info":
      return theme.color.statusInfoSurface
    case "neutral":
      return theme.color.interactionNeutral
    default:
      return withAlpha(getTone(variant, theme), 0.1)
  }
}

const Root = styled.span<{
  $variant: BadgeVariant
  $size: BadgeSize
  $shape: BadgeShape
  pulsate?: boolean
}>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  gap: ${({ $shape }) => ($shape === "pill" ? "0.5rem" : "0.4rem")};
  height: ${({ $shape, $size }) =>
    $shape === "pill" ? ($size === "sm" ? "2.2rem" : "2.8rem") : "auto"};
  padding: ${({ $shape, $size }) =>
    $shape === "pill"
      ? $size === "sm"
        ? "0 0.7rem"
        : "0 0.9rem"
      : "0.5rem"};
  border: ${({ $shape, $variant, theme }) =>
    $shape === "pill"
      ? `1px solid ${withAlpha(getTone($variant, theme), 0.32)}`
      : 0};
  border-radius: ${({ $shape }) => ($shape === "pill" ? "999px" : "0.4rem")};
  color: ${({ $variant, theme }) => getTone($variant, theme)};
  background: ${({ $shape, $variant, theme }) =>
    $shape === "pill"
      ? withAlpha(getTone($variant, theme), 0.1)
      : chipBackground($variant, theme)};
  font-size: ${({ $shape, theme }) =>
    $shape === "pill" ? theme.fontSize.xs : "1.1rem"};
  font-weight: ${({ $shape }) => ($shape === "pill" ? 600 : 400)};
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

const Icon = styled.div<{ hasGap: boolean; $shape: BadgeShape }>`
  display: flex;
  justify-content: center;
  align-items: center;

  ${({ hasGap }) => !hasGap && "margin: 0 -0.1rem;"}

  svg {
    width: ${({ $shape }) => ($shape === "pill" ? "1.4rem" : "1.6rem")};
    height: ${({ $shape }) => ($shape === "pill" ? "1.4rem" : "1.6rem")};
  }
`

export const Badge = React.forwardRef<HTMLSpanElement, Props>(
  (
    {
      type,
      variant,
      size = "md",
      shape = "chip",
      icon,
      pulsate,
      children,
      className,
      "data-hook": dataHook,
      ...rest
    },
    ref,
  ) => (
    <Root
      {...rest}
      ref={ref}
      className={className}
      $variant={getVariant(variant, type)}
      $size={size}
      $shape={shape}
      pulsate={pulsate}
      data-hook={dataHook}
    >
      {icon && (
        <Icon $shape={shape} hasGap={React.Children.count(children) > 0}>
          {icon}
        </Icon>
      )}
      {children}
    </Root>
  ),
)

Badge.displayName = "Badge"
