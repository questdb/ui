import type React from "react"
import styled from "styled-components"
import { statusInfoFocus } from "../../theme"

export type ButtonType = "button" | "submit"

// Keep the base independent of Tooltip and other interactive components so
// lightweight controls can share button behavior without importing them.
// eslint-disable-next-line no-restricted-syntax
export const ButtonBase = styled.button.attrs<{
  as?: React.ElementType
  type?: ButtonType
}>(({ as, type }) =>
  as == null || as === "button" ? { type: type ?? "button" } : {},
)`
  appearance: none;
  box-sizing: border-box;
  margin: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    color 120ms ease,
    opacity 120ms ease,
    filter 120ms ease;

  &&:focus-visible {
    outline: 1px solid ${({ theme }) => statusInfoFocus(theme.color.statusInfo)};
    outline-offset: 2px;
  }

  &&:disabled,
  &&[aria-disabled="true"] {
    cursor: not-allowed;
  }

  &&:active:not(:disabled):not([aria-disabled="true"]):not([role="tab"]) {
    filter: brightness(0.9);
  }
`
