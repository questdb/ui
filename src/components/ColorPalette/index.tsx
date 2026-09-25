import React from "react"
import styled, { useTheme, type DefaultTheme } from "styled-components"
import { Check } from "../icons"
import { ButtonBase } from "../Button"
import { pickReadableTextColor } from "../../utils"

export type ThemeColorToken = keyof DefaultTheme["color"]

const Root = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
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

type Props<Token extends ThemeColorToken> = {
  tokens: readonly Token[]
  selectedToken: Token
  onSelect: (token: Token) => void
  labelPrefix?: string
  labelFor?: (token: Token) => string
}

export const ColorPalette = <Token extends ThemeColorToken>({
  tokens,
  selectedToken,
  onSelect,
  labelPrefix = "Color",
  labelFor,
}: Props<Token>) => {
  const theme = useTheme()

  return (
    <Root>
      {tokens.map((token, index) => (
        <ColorBox
          key={token}
          aria-label={
            labelFor ? labelFor(token) : `${labelPrefix} ${index + 1}`
          }
          title={labelFor ? labelFor(token) : undefined}
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
    </Root>
  )
}
