import React from "react"
import styled from "styled-components"
import { Box } from "../Box"
import { color } from "../../utils"
import { CornerDownLeft } from "@styled-icons/evaicons-solid"
import type { ThemeShape } from "../../types"

type ColorFunction = (props?: { theme: ThemeShape }) => string | undefined

const StyledKey = styled(Box).attrs({
  alignItems: "center",
  justifyContent: "center",
})<{ $color?: string | ColorFunction; $hoverColor?: string | ColorFunction }>`
  padding: 0 0.4rem;
  background: ${color("backgroundDarker")};
  border: 0.5px solid ${color("midnight")};
  border-radius: 0.2rem;
  font-size: 1.2rem;
  height: 1.8rem;
  min-width: 2rem;
  color: ${({ $color, theme }) => {
    if (typeof $color === "function") {
      // Handle color() function signature which expects { theme }
      const result = $color({ theme })
      return result || theme.color.foreground
    }
    return $color || theme.color.foreground
  }};
  position: relative;
  display: flex;
  box-shadow:
    0px 12px 16px -4px rgba(0, 0, 0, 0.2),
    0px 4px 6px -2px rgba(0, 0, 0, 0.2),
    0px 2px 2px -1px rgba(0, 0, 0, 0.2),
    0 0 4px 0 rgba(96, 96, 96, 0.2) inset;
  transition: color 0.2s ease;

  &:hover {
    color: ${({ $hoverColor, $color, theme }) => {
      if (typeof $hoverColor === "function") {
        const hoverResult = $hoverColor({ theme })
        const colorResult =
          typeof $color === "function" ? $color({ theme }) : $color
        return hoverResult || colorResult || theme.color.foreground
      }
      const colorResult =
        typeof $color === "function" ? $color({ theme }) : $color
      return $hoverColor || colorResult || theme.color.foreground
    }};
  }

  svg {
    color: ${({ $color, theme }) => {
      if (typeof $color === "function") {
        const result = $color({ theme })
        return result || theme.color.foreground
      }
      return $color || theme.color.foreground
    }};
    fill: ${({ $color, theme }) => {
      if (typeof $color === "function") {
        const result = $color({ theme })
        return result || theme.color.foreground
      }
      return $color || theme.color.foreground
    }};
  }

  &:hover svg {
    color: ${({ $hoverColor, $color, theme }) => {
      if (typeof $hoverColor === "function") {
        const hoverResult = $hoverColor({ theme })
        const colorResult =
          typeof $color === "function" ? $color({ theme }) : $color
        return hoverResult || colorResult || theme.color.foreground
      }
      const colorResult =
        typeof $color === "function" ? $color({ theme }) : $color
      return $hoverColor || colorResult || theme.color.foreground
    }};
    fill: ${({ $hoverColor, $color, theme }) => {
      if (typeof $hoverColor === "function") {
        const hoverResult = $hoverColor({ theme })
        const colorResult =
          typeof $color === "function" ? $color({ theme }) : $color
        return hoverResult || colorResult || theme.color.foreground
      }
      const colorResult =
        typeof $color === "function" ? $color({ theme }) : $color
      return $hoverColor || colorResult || theme.color.foreground
    }};
  }

  &:not(:last-child) {
    margin-right: 0.25rem;
  }
`

type Props = {
  keyString: string
  color?: string | ColorFunction
  hoverColor?: string | ColorFunction
}

export const Key = ({ keyString, color: keyColor, hoverColor }: Props) => {
  const isEnter = keyString.toLowerCase() === "enter"

  return (
    <StyledKey $color={keyColor} $hoverColor={hoverColor || keyColor}>
      {isEnter ? <CornerDownLeft size="16px" /> : keyString}
    </StyledKey>
  )
}
