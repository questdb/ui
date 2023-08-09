import React from "react";
import styled from "styled-components";

type Props = {
  flexDirection?: React.CSSProperties["flexDirection"];
  gap?: React.CSSProperties["gap"];
  margin?: React.CSSProperties["margin"];
  align?: React.CSSProperties["alignItems"];
  alignSelf?: React.CSSProperties["alignSelf"];
  justifyContent?: React.CSSProperties["justifyContent"];
  width?: React.CSSProperties["width"];
};

export const Box = styled.div.attrs<Props, Props>((props) => ({
  flexDirection: props.flexDirection || "row",
  gap: props.gap || "1rem",
  margin: props.margin || "0",
  align: props.align || "center",
  alignSelf: props.alignSelf || "center",
  justifyContent: props.justifyContent || "flex-start",
  width: props.width || "auto",
}))`
  display: flex;
  flex-direction: ${({ flexDirection }) => flexDirection};
  gap: ${({ gap }) => gap};
  margin: ${({ margin }) => margin};
  align-items: ${({ align }) => align};
  align-self: ${({ alignSelf }) => alignSelf};
  justify-content: ${({ justifyContent }) => justifyContent};
  width: ${({ width }) => width};
`;
