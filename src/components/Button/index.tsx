import React, { FocusEvent, MouseEvent, ReactNode } from "react"
import styled, { css } from "styled-components"
import type { DefaultTheme } from "styled-components"
import { Tooltip } from "../Tooltip"
import type { FontSize } from "../../types"
import type { ButtonVariant } from "./variants"
import { makeButtonVariant } from "./variants"
import {
  brandLinearGradientHorizontal,
  brandLinearGradientVertical,
} from "../../theme"
import { BUTTON_HEIGHTS } from "./tokens"

export { BUTTON_HEIGHTS, TOOLBAR_CONTROL_HEIGHT } from "./tokens"

export const sizes = ["sm", "md", "lg"] as const
export type Size = (typeof sizes)[number]
type Type = "button" | "submit"

const getPinkGradient = (props: ButtonProps & { theme: DefaultTheme }) =>
  props.gradientStyle === "vertical"
    ? brandLinearGradientVertical(props.theme.color)
    : brandLinearGradientHorizontal(props.theme.color)

const getHoverPinkGradient = (props: ButtonProps & { theme: DefaultTheme }) => {
  const base = getPinkGradient(props)
  return base.includes("180deg")
    ? base.replace("180deg", "0deg")
    : base.replace("90deg", "270deg")
}

const getBorderWidth = (props: ButtonProps) =>
  "gradientWeight" in props && props.gradientWeight === "thick" ? "2px" : "1px"

const getFillColor = (props: ButtonProps & { theme: DefaultTheme }) =>
  "gradientWeight" in props && props.gradientWeight === "thick"
    ? props.theme.color.controlSurface
    : props.theme.color.surfaceInset

const getHoverFillColor = (props: ButtonProps & { theme: DefaultTheme }) =>
  "gradientWeight" in props && props.gradientWeight === "thick"
    ? props.theme.color.controlSurfaceHover
    : props.theme.color.surfaceInset

type BaseButtonProps = {
  as?: React.ElementType
  children?: ReactNode
  className?: string
  disabled?: boolean
  disabledTooltip?: string
  fontSize?: FontSize
  onClick?: (event: MouseEvent) => void
  onDoubleClick?: (event: MouseEvent) => void
  onMouseDown?: (event: MouseEvent) => void
  onMouseEnter?: (event: MouseEvent) => void
  onMouseLeave?: (event: MouseEvent) => void
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>) => void
  onDragEnd?: (event: React.DragEvent<HTMLButtonElement>) => void
  onFocus?: (event: FocusEvent) => void
  onBlur?: (event: FocusEvent) => void
  size?: Size
  fullWidth?: boolean
  type?: Type
  title?: string
  rounded?: boolean
  prefixIcon?: React.ReactNode
  leadingIcon?: React.ReactNode
  trailingIcon?: React.ReactNode
  dataHook?: string
  id?: string
  href?: string
  target?: string
  rel?: string
  download?: string | boolean
  draggable?: boolean
  "aria-label"?: string
  "aria-pressed"?: boolean
  "aria-expanded"?: boolean
  "aria-controls"?: string
}

type VariantProps = {
  variant?: ButtonVariant
  gradientWeight?: "thin" | "thick"
  gradientStyle?: "horizontal" | "vertical"
}

export type ButtonProps = BaseButtonProps & VariantProps

const Prefix = styled.div<{ disabled?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  filter: ${({ disabled }) => (disabled ? "grayscale(100%)" : "none")};
`

const Suffix = Prefix

export const Button: React.FunctionComponent<ButtonProps> = React.forwardRef(
  (
    {
      as,
      children,
      prefixIcon,
      leadingIcon,
      trailingIcon,
      disabled,
      disabledTooltip,
      ...props
    },
    ref,
  ) => {
    const type =
      as == null || as === "button" ? { type: props.type ?? "button" } : {}
    const { style } = props as { style?: React.CSSProperties }
    const startIcon = leadingIcon ?? prefixIcon
    const button = (
      <StyledButton
        ref={ref}
        as={as ?? "button"}
        disabled={disabled}
        data-hook={props.dataHook}
        {...props}
        {...type}
      >
        {startIcon && <Prefix disabled={disabled}>{startIcon}</Prefix>}
        {children}
        {trailingIcon && <Suffix disabled={disabled}>{trailingIcon}</Suffix>}
      </StyledButton>
    )

    if (disabled && disabledTooltip) {
      return (
        <Tooltip content={disabledTooltip}>
          {/*
            Browsers suppress pointer events on disabled buttons, so hovering
            the button would not reach the Radix tooltip trigger (this span) and
            the tooltip would not open. Make the disabled button transparent to
            pointer events so the hover falls through to the span and the
            tooltip shows reliably.
          */}
          <span style={{ display: "inline-flex" }}>
            {React.cloneElement(button, {
              style: { ...style, pointerEvents: "none" },
            })}
          </span>
        </Tooltip>
      )
    }

    return button
  },
)

// The one sanctioned native-button wrapper every other control extends.
// eslint-disable-next-line no-restricted-syntax
export const ButtonBase = styled.button.attrs<{
  as?: React.ElementType
  type?: Type
}>(({ as, type }) =>
  as == null || as === "button" ? { type: type ?? "button" } : {},
)`
  appearance: none;
  box-sizing: border-box;
  margin: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    color 120ms ease,
    opacity 120ms ease,
    filter 120ms ease;

  &&:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.contentAccent};
    outline-offset: 2px;
  }

  &&:disabled,
  &&[aria-disabled="true"] {
    cursor: not-allowed;
  }

  &&:active:not(:disabled):not([aria-disabled="true"]) {
    filter: brightness(0.9);
  }
`

const StyledButton = styled(ButtonBase)<ButtonProps>`
  display: inline-flex;
  height: ${getSize};
  padding: ${getPadding};
  gap: 0.6rem;
  align-items: center;
  justify-content: center;
  background: transparent;
  border-radius: 4px;
  border: 1px solid transparent;
  font-weight: 500;
  font-size: ${({ fontSize, theme }) => theme.fontSize[fontSize ?? "sm"]};
  letter-spacing: 0.01em;
  transition:
    background 150ms ease,
    border-color 150ms ease,
    color 150ms ease,
    filter 150ms ease;
  line-height: 1.15;
  cursor: pointer;

  ${(props) =>
    props.rounded &&
    css`
      border-radius: 50%;
      width: ${getSize};
      height: ${getSize};
      padding: 0;
    `}

  ${(props) =>
    props.disabled &&
    `
    cursor: default;
  `}

  ${(props) =>
    props.fullWidth &&
    css`
      width: 100%;
    `}

  ${(props) => makeButtonVariant(props.variant ?? "primary")}

  ${(props) =>
    props.variant === "gradient" &&
    css`
      && {
        border: ${getBorderWidth} solid transparent;
        background:
          linear-gradient(${getFillColor}, ${getFillColor}) padding-box,
          ${getPinkGradient} border-box;
        color: ${props.theme.color.contentPrimary};
      }

      &&:hover:not(:disabled):not([aria-disabled="true"]) {
        background:
          linear-gradient(${getHoverFillColor}, ${getHoverFillColor})
            padding-box,
          ${getHoverPinkGradient} border-box;
        color: ${props.theme.color.contentPrimary};
      }

      &&:disabled,
      &&[aria-disabled="true"] {
        border: ${getBorderWidth(props)} solid ${props.theme.color.borderSubtle};
        background: ${props.theme.color.surfaceRaised};
        color: ${props.theme.color.contentDisabled};
      }
    `}
`

function getSize({ size }: { size?: Size }) {
  return BUTTON_HEIGHTS[size ?? "md"]
}

function getPadding({ size, rounded }: { size?: Size; rounded?: boolean }) {
  if (rounded) return "0"
  const paddings = {
    sm: "0 0.8rem",
    md: "0 1.2rem",
    lg: "0 1.6rem",
  }
  return paddings[size ?? "md"]
}
