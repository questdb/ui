import React from "react";
import styled from "styled-components";
import { Input as UnstyledInput } from "../Input";

export const TextArea = styled(UnstyledInput).attrs({
  as: "textarea",
})<
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    resize: CSSStyleDeclaration["resize"];
  }
>`
  width: 100%;
  height: inherit;
  resize: ${({ resize }) => resize || "auto"};
`;
