import React from "react"
import styled from "styled-components"
import { Check } from "@styled-icons/boxicons-regular"
import { Box } from "../../../components"

const primaryColors = ["#FF6B6B", "#4ECDC4", "#FFD93D", "#95D86E", "#FF8F40"]

const secondaryColors = ["#BD93F9", "#50FA7B", "#FF79C6", "#8BE9FD", "#F1FA8C"]

export const colors = [...primaryColors, ...secondaryColors]

export const defaultColor = "#FF6B6B"

export const getColorForNewMetric = (
  existingColors: string[],
  lastColor: string,
) => {
  const filteredColorPalette = colors.filter((color) => color !== lastColor)
  const filterExisting = filteredColorPalette.filter(
    (color) => !existingColors.includes(color),
  )
  return filterExisting.length > 0
    ? filterExisting[Math.floor(Math.random() * filterExisting.length)]
    : filteredColorPalette[
        Math.floor(Math.random() * filteredColorPalette.length)
      ]
}

const Root = styled.div`
  padding: 0.5rem;
`

const ColorBox = styled.div`
  position: relative;
  width: 1.6rem;
  height: 1.6rem;
  cursor: pointer;
`

const CheckIcon = styled(Check)`
  position: absolute;
  color: black;
`

export const ColorPalette = ({
  selectedColor,
  onSelect,
}: {
  selectedColor: string
  onSelect: (color: string) => void
}) => (
  <Root>
    <Box gap="0.5rem">
      {colors.map((color) => (
        <ColorBox
          key={color}
          style={{ backgroundColor: color }}
          onClick={() => onSelect(color)}
        >
          {selectedColor === color && <CheckIcon size="16px" />}
        </ColorBox>
      ))}
    </Box>
  </Root>
)
