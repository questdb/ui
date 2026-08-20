import styled, { css } from "styled-components"

import { ButtonBase } from "../Button"

type SelectableCardButtonProps = {
  $selected?: boolean
}

/** Shared large-target treatment for provider cards and similar choices. */
export const SelectableCardButton = styled(
  ButtonBase,
).attrs<SelectableCardButtonProps>(({ $selected }) => ({
  "aria-pressed": $selected,
}))<SelectableCardButtonProps>`
  && {
    border: 1px solid ${({ theme }) => theme.color.borderDefault};
    border-radius: 0.8rem;
    background: ${({ theme }) => theme.color.surfaceInput};
    color: ${({ theme }) => theme.color.contentSecondary};
  }

  &&:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.color.borderAccent};
    background: ${({ theme }) => theme.color.interactionAccentHover};
    color: ${({ theme }) => theme.color.contentPrimary};
  }

  ${({ $selected, theme }) =>
    $selected &&
    css`
      && {
        border-color: ${theme.color.borderAccent};
        background: ${theme.color.interactionAccentActive};
        color: ${theme.color.contentPrimary};
        box-shadow: inset 0 0 0 1px ${theme.color.borderAccent};
      }
    `}
`
