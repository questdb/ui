import React from "react"
import styled from "styled-components"
import { ArrowBendDownLeftIcon } from "@phosphor-icons/react"
import { Box } from "../Box"
import type { ThemeShape } from "../../types"
import { shortcutKeycapStyles } from "./styles"

type ColorFunction = (props?: { theme: ThemeShape }) => string | undefined

const StyledKey = styled(Box).attrs({
  alignItems: "center",
  justifyContent: "center",
})<{ $color?: string | ColorFunction }>`
  ${shortcutKeycapStyles}

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
}

export const Key = ({ keyString, color: keyColor }: Props) => {
  const isEnter = keyString.toLowerCase() === "enter"

  return (
    <StyledKey $color={keyColor}>
      {isEnter ? (
        <ArrowBendDownLeftIcon aria-label="Enter" size={12} weight="bold" />
      ) : (
        keyString
      )}
    </StyledKey>
  )
}
