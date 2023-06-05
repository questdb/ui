import React from "react";
import styled, { css } from "styled-components";
import { color } from "../../theme/color";

type Props = {
  gap?: string;
  background?: keyof typeof color;
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
