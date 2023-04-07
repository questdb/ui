import React, { ReactNode } from "react";
import styled, { css } from "styled-components";

import type { Color, ColorShape, FontSize } from "../../types";
import { color } from "../../theme/color";

type FontStyle = "normal" | "italic";
type Transform = "capitalize" | "lowercase" | "uppercase";
type Type = "span" | "label";

export type TextProps = Readonly<{
  _style?: FontStyle;
  align?: "left" | "right" | "center";
  className?: string;
  code?: boolean;
  color?: Color;
  children?: ReactNode;
  ellipsis?: boolean;
  htmlFor?: string;
  onClick?: () => void;
  size?: FontSize;
  title?: string;
  transform?: Transform;
  type?: Type;
  weight?: number;
  linkColor?: Color;
}>;

const defaultProps: Readonly<{
  color: Color;
  type: Type;
}> = {
  color: "inherit",
  type: "span",
};

const ellipsisStyles = css`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const textStyles = css<TextProps>`
  color: ${(props) => (props.color ? color[props.color] : "inherit")};
  font-family: ${({ code, theme }) => code && theme.fontMonospace};
  font-size: ${({ size, theme }) => (size ? theme.fontSize[size] : "inherit")};
  font-style: ${({ _style }) => _style ?? "inherit"};
  font-weight: ${({ weight }) => weight};
  text-transform: ${({ transform }) => transform};
  ${({ align }) => (align ? `text-align: ${align}` : "")};
  ${({ ellipsis }) => ellipsis && ellipsisStyles};
  line-height: 1.5;
`;

const TextStyled = styled.label<TextProps>`
  ${textStyles};

  a {
    color: ${({ linkColor, theme }) =>
      linkColor ? theme.color[linkColor] : theme.color.cyan};
  }
`;

export const Text = ({ type, ...rest }: TextProps) => {
  return <TextStyled as={type} {...rest} type={type} />;
};

Text.defaultProps = defaultProps;
