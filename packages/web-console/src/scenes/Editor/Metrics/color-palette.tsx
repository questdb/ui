import React from "react"
import styled from "styled-components"
import { Box } from "@questdb/react-components"
import { Check } from "@styled-icons/boxicons-regular"

export const colors = [
  "#bbbbbb",
  "#f8f8f2",
  "#6272a4",
  "#ff5555",
  "#ffb86c",
  "#f1fa8c",
  "#50fa7b",
  "#bd93f9",
  "#8be9fd",
  "#d14671",
  "#fafafa",
]

export const defaultColor = "#8be9fd"

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
