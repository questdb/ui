import styled, { css } from "styled-components";
import React from "react";

type InputVariant = "transparent" | "error";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  variant?: InputVariant;
};

const errorStyle = css`
  border-color: ${({ theme }) => theme.color.red};
  background-color: #ff555515;
`;

export const Input = styled.input.attrs((props) => ({
  "data-lpignore": !!props.autoComplete,
}))<InputProps>`
  background: ${({ theme }) => theme.color.selection};
  border: 1px transparent solid;
  padding: 0 0.75rem;
  height: 3rem;
  line-height: 3rem;
  border-radius: 0.4rem;
  outline: none;
  color: ${({ theme }) => theme.color.white};
  flex: 1;
  max-width: 100%;

  &::placeholder {
    color: ${({ theme }) => theme.color.gray2};
  }

  &:focus {
    border-color: ${({ theme }) => theme.color.pink};
    background: ${({ theme }) => theme.color.selection};
  }

  ${({ variant, theme }) =>
    variant === "transparent" &&
    `
    background: transparent;
    border-color: ${theme.color.selection};
  `}

  ${({ variant }) => variant === "error" && errorStyle}
`;
