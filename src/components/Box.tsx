import React from "react"
import styled from "styled-components"

type Props = {
  flexDirection?: React.CSSProperties["flexDirection"]
  gap?: React.CSSProperties["gap"]
  margin?: React.CSSProperties["margin"]
  align?: React.CSSProperties["alignItems"]
  justifyContent?: React.CSSProperties["justifyContent"]
  alignSelf?: React.CSSProperties["alignSelf"]
}

export const Box = styled.div.attrs<Props, Props>((props) => ({
  flexDirection: props.flexDirection || "row",
  gap: props.gap || "1rem",
  margin: props.margin || "0",
  align: props.align || "center",
  justifyContent: props.justifyContent || "flex-start",
  alignSelf: props.alignSelf || "",
}))`
  display: flex;
  flex-direction: ${({ flexDirection }) => flexDirection};
  gap: ${({ gap }) => gap};
  margin: ${({ margin }) => margin};
  align-items: ${({ align }) => align};
  justify-content: ${({ justifyContent }) => justifyContent};
  align-self: ${({ alignSelf }) => alignSelf};
`
