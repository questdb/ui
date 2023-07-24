import React from "react";
import styled from "styled-components";
import { Input as UnstyledInput } from "../Input";

export const TextArea = styled(UnstyledInput).attrs({
  as: "textarea",
})<React.TextareaHTMLAttributes<HTMLTextAreaElement>>`
  width: 100%;
  height: inherit;
`;
