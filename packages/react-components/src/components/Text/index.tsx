import React, { ReactNode } from "react";
import styled, { css } from "styled-components";

import type { Size } from "../../theme/font";
import type { Color } from "../../theme/color";
import { color } from "../../theme/color";

export type Props = {
  _style?: "normal" | "italic";
  align?: "left" | "right" | "center";
  className?: string;
  code?: boolean;
  color?: keyof Color;
  children?: ReactNode;
  ellipsis?: boolean;
  htmlFor?: string;
  onClick?: () => void;
  size?: Size;
  title?: string;
  transform?: "capitalize" | "lowercase" | "uppercase";
  type?: "span" | "label";
  weight?: number;
  linkColor?: keyof Color;
};

const defaultProps: {
  color: Props["color"];
  type: Props["type"];
} = {
  color: "inherit",
  type: "span",
};

const ellipsisStyles = css`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const textStyles = css<Props>`
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

const TextStyled = styled.label<Props>`
  ${textStyles};

  a {
    color: ${({ linkColor, theme }) =>
      linkColor ? theme.color[linkColor] : theme.color.cyan};
  }
`;

export const Text = ({ type, ...rest }: Props) => {
  return <TextStyled as={type} {...rest} type={type} />;
};

Text.defaultProps = defaultProps;
