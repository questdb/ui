import React from "react"
import styled, { useTheme } from "styled-components"
import { Loader3 } from "@styled-icons/remix-line"
import { Color } from "../../types"
import { spinAnimation } from "../../components/Animation"

const StyledLoader = styled(Loader3)<{ $size: string; $color: Color }>`
  width: ${({ $size }) => $size};
  height: ${({ $size }) => $size};
  color: ${({ $color, theme }) =>
    $color ? theme.color[$color] : theme.color.pink};
  ${spinAnimation};
`

type Props = {
  size?: string
  color?: Color
}

export const LoadingSpinner = ({ size = "18px", color = "pink" }: Props) => {
  const theme = useTheme()
  return (
    <StyledLoader
      data-hook="loading-spinner"
      $size={size}
      $color={color}
      theme={theme}
    />
  )
}
