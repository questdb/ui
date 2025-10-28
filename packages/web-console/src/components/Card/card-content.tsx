import styled, { css } from "styled-components";
import { Color } from "../../types";

type Props = {
  gap?: string;
  background?: Color;
  centered?: boolean;
};

export const CardContent = styled.div.attrs<Props, Props>((props) => ({
  gap: props.gap ?? "2rem",
  background: props.background ?? "transparent",
}))`
  padding: ${({ gap }) => gap};
  background-color: ${({ theme, background }) =>
    theme.color[background ?? "inherit"]};
  flex-grow: 1;

  ${({ centered }) =>
    centered &&
    css`
      display: flex;
      justify-content: center;
    `}
`;
