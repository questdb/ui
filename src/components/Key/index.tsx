import React from "react"
import styled, { css } from "styled-components"
import { ArrowBendDownLeftIcon } from "@phosphor-icons/react"
import { Box } from "../Box"
import type { ThemeShape } from "../../types"
import { shortcutKeycapStyles } from "./styles"

type ColorFunction = (props?: { theme: ThemeShape }) => string | undefined
type KeySize = "sm" | "md"

const ENTER_ICON_SIZES: Record<KeySize, number> = { sm: 11, md: 12 }

const compactKeycapStyles = css`
  height: 2rem;
  min-width: 2.2rem;
  padding: 0.15rem 0.5rem;
`

const StyledKey = styled(Box).attrs({
  alignItems: "center",
  justifyContent: "center",
})<{ $color?: string | ColorFunction; $size: KeySize }>`
  ${shortcutKeycapStyles}
  ${({ $size }) => $size === "sm" && compactKeycapStyles}

  color: ${({ $color, theme }) => {
    if (typeof $color === "function") {
      // Handle color() function signature which expects { theme }
      const result = $color({ theme })
      return result || theme.color.contentSecondary
    }
    return $color || theme.color.contentSecondary
  }};
`

type Props = {
  keyString: string
  color?: string | ColorFunction
  size?: KeySize
}

export const Key = ({ keyString, color: keyColor, size = "md" }: Props) => {
  const isEnter = keyString.toLowerCase() === "enter"

  return (
    <StyledKey $color={keyColor} $size={size}>
      {isEnter ? (
        <ArrowBendDownLeftIcon
          aria-label="Enter"
          size={ENTER_ICON_SIZES[size]}
          weight="bold"
        />
      ) : (
        keyString
      )}
    </StyledKey>
  )
}
