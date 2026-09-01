import styled, { css } from "styled-components"
import React from "react"

export type InputVariant = "transparent" | "error"

export type InputTone = "neutral" | "accent"

export type InputStyleProps = {
  variant?: InputVariant
  $tone?: InputTone
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & InputStyleProps

const errorStyle = css`
  border-color: ${({ theme }) => theme.color.statusDanger};
  background-color: ${({ theme }) => theme.color.statusDangerSurface};
  &:focus {
    border-color: ${({ theme }) => theme.color.statusDanger};
    background: ${({ theme }) => theme.color.statusDangerSurface};
  }
`

export const inputStyles = css<InputStyleProps>`
  box-sizing: border-box;
  background: ${({ theme }) => theme.color.surfaceInput};
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  padding: 0 1rem;
  height: 3.4rem;
  line-height: 1.4;
  border-radius: 0.6rem;
  outline: none;
  color: ${({ theme }) => theme.color.contentPrimary};
  font-size: 1.4rem;
  font-weight: 400;
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;

  &::placeholder {
    color: ${({ theme }) => theme.color.contentSecondary};
  }

  &:focus,
  &:focus-visible {
    outline: none;
    box-shadow: none;
    border-color: ${({ theme, $tone }) =>
      $tone === "accent"
        ? theme.color.contentAccent
        : theme.color.borderStrong};
    background: ${({ theme }) => theme.color.surfaceInput};
  }

  &:disabled {
    cursor: not-allowed;
    color: ${({ theme }) => theme.color.contentDisabled};
    background: ${({ theme }) => theme.color.surfaceRaised};
    border-color: ${({ theme }) => theme.color.borderDefault};
    opacity: 0.6;
  }

  ${({ variant, theme }) =>
    variant === "transparent" &&
    `
    background: transparent;
    border-color: ${theme.color.interactionNeutral};
  `}

  ${({ variant }) => variant === "error" && errorStyle}
`

export const Input = styled.input.attrs((props) => ({
  "data-lpignore": props.autoComplete === "off",
}))<InputProps>`
  ${inputStyles}
`
