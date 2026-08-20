import React from "react"
import styled, { useTheme } from "styled-components"
import { Check } from "../../../components/icons"
import { ButtonBase } from "../../../components"
import { Box } from "../../../components"
import { pickReadableTextColor } from "../../../utils"
import { metricColorTokens, type MetricColorToken } from "./metricColors"

const Root = styled.div`
  padding: 0.5rem;
`

const ColorBox = styled(ButtonBase)`
  position: relative;
  width: 1.6rem;
  height: 1.6rem;
  padding: 0;
  border: 0;
  cursor: pointer;
`

const CheckIcon = styled(Check)`
  position: absolute;
`

export const ColorPalette = ({
  selectedToken,
  onSelect,
}: {
  selectedToken: MetricColorToken
  onSelect: (token: MetricColorToken) => void
}) => {
  const theme = useTheme()

  return (
    <Root>
      <Box gap="0.5rem">
        {metricColorTokens.map((token, index) => (
          <ColorBox
            key={token}
            aria-label={`Series color ${index + 1}`}
            aria-pressed={selectedToken === token}
            style={{ backgroundColor: theme.color[token] }}
            onClick={() => onSelect(token)}
          >
            {selectedToken === token && (
              <CheckIcon
                size="16px"
                color={pickReadableTextColor(theme.color[token], [
                  theme.color.contentInverse,
                  theme.color.neutralInk,
                ])}
              />
            )}
          </ColorBox>
        ))}
      </Box>
    </Root>
  )
}
