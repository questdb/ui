import React, { MouseEvent, ReactNode } from "react"
import styled, { css } from "styled-components"
import type { DefaultTheme } from "styled-components"
import type { FontSize } from "../../types"
import type { Skin } from "./skin"
import { makeSkin } from "./skin"
import {
  pinkLinearGradientHorizontal,
  pinkLinearGradientVertical,
} from "../../theme"

export const sizes = ["sm", "md", "lg"] as const
export type Size = (typeof sizes)[number]
type Type = "button" | "submit"

const getPinkGradient = (props: ButtonProps & { theme: DefaultTheme }) =>
  props.gradientStyle === "vertical"
    ? pinkLinearGradientVertical
    : pinkLinearGradientHorizontal

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
    ? props.theme.color.selectionDarker
    : props.theme.color.midnight

type BaseButtonProps = {
  as?: React.ElementType
  children?: ReactNode
  className?: string
  disabled?: boolean
  fontSize?: FontSize
  onClick?: (event: MouseEvent) => void
  size?: Size
  fullWidth?: boolean
  type?: Type
  title?: string
  rounded?: boolean
  prefixIcon?: React.ReactNode
  dataHook?: string
}

type GradientOnlyProps = {
  skin: "gradient"
  gradientWeight?: "thin" | "thick"
  gradientStyle?: "horizontal" | "vertical"
}

type NonGradientProps = {
  skin?: Exclude<Skin, "gradient">
  gradientWeight?: never
  gradientStyle?: never
}

export type ButtonProps = BaseButtonProps &
  (GradientOnlyProps | NonGradientProps)

const Prefix = styled.div<{ disabled?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 0.5rem;
  pointer-events: none;
  filter: ${({ disabled }) => (disabled ? "grayscale(100%)" : "none")};
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
`

export const Button: React.FunctionComponent<ButtonProps> = React.forwardRef(
  ({ as, children, prefixIcon, disabled, ...props }, ref) => {
    const type = as === "button" ? { type: "button" } : {}
    return (
      <StyledButton
        ref={ref}
        as={as ?? "button"}
        disabled={disabled}
        data-hook={props.dataHook}
        {...props}
        {...type}
      >
        {prefixIcon && <Prefix disabled={disabled}>{prefixIcon}</Prefix>}
        {children}
      </StyledButton>
    )
  },
)

const StyledButton = styled.button<ButtonProps>`
  display: inline-flex;
  height: ${getSize};
  padding: 0 1rem;
  align-items: center;
  justify-content: center;
  background: transparent;
  border-radius: 4px;
  border: 1px solid transparent;
  outline: 0;
  font-weight: 400;
  line-height: 1.15;
  cursor: pointer;

  svg + span {
    margin-left: 0.5rem;
  }

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

  ${(props) => makeSkin(props.skin ?? "primary")}

  ${(props) =>
    props.skin === "gradient" &&
    css`
      border: ${getBorderWidth} solid transparent;
      background:
        linear-gradient(${getFillColor}, ${getFillColor}) padding-box,
        ${getPinkGradient} border-box;
      color: ${props.theme.color.white};

      &:hover:not([disabled]) {
        background:
          linear-gradient(${getFillColor}, ${getFillColor}) padding-box,
          ${getHoverPinkGradient} border-box;
        filter: brightness(120%);
      }

      &:disabled {
        border: ${getBorderWidth(props)} solid ${props.theme.color.gray1};
        background: ${props.theme.color.selection};
        color: ${props.theme.color.gray1};
      }
    `}
`

function getSize({ size }: { size?: Size }) {
  const sizes = {
    sm: "2rem",
    md: "3rem",
    lg: "5rem",
  }
  return sizes[size ?? "md"]
}
