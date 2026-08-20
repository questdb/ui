import styled, { css } from "styled-components"
import { Color } from "../../types"

type Props = {
  gap?: string
  background?: Color
  centered?: boolean
}

export const CardContent = styled.div.attrs<Props, Props>((props) => ({
  gap: props.gap ?? "2rem",
  background: props.background ?? "transparent",
}))`
  padding: ${({ gap }) => gap};
  background-color: ${({ theme, background }) =>
    background == null || background === "transparent"
      ? "transparent"
      : theme.color[background]};
  flex-grow: 1;

  ${({ centered }) =>
    centered &&
    css`
      display: flex;
      justify-content: center;
    `}
`
