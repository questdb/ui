import React from "react"
import styled from "styled-components"
import { inputStyles, type InputStyleProps } from "../Input"

export const TextArea = styled.textarea.attrs((props) => ({
  "data-lpignore": props.autoComplete === "off",
}))<
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    resize?: CSSStyleDeclaration["resize"]
  } & InputStyleProps
>`
  ${inputStyles}
  box-sizing: border-box;
  width: 100%;
  height: inherit;
  padding: 0.9rem 1rem;
  line-height: 1.5;
  resize: ${({ resize }) => resize || "auto"};
`
