import styled, { css } from "styled-components"

import { ButtonBase } from "../Button"

type TabButtonProps = { $active?: boolean }

/** Shared tab treatment for editor, drawer, and result-panel navigation. */
export const TabButton = styled(ButtonBase).attrs<TabButtonProps>(
  ({ $active, role }) =>
    role === "tab" ? { "aria-selected": $active } : { "aria-pressed": $active },
)<TabButtonProps>`
  && {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    min-height: 3.2rem;
    padding: 0.6rem 1.2rem;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: ${({ theme }) => theme.color.contentSecondary};
    font-size: ${({ theme }) => theme.fontSize.sm};
    font-weight: 500;
    line-height: 1.15;
  }

  &&:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.surfaceRaised};
    color: ${({ theme }) => theme.color.contentPrimary};
  }

  ${({ $active, theme }) =>
    $active &&
    css`
      && {
        border-bottom-color: ${theme.color.contentAccent};
        background: ${theme.color.surfaceRaised};
        color: ${theme.color.contentPrimary};
        font-weight: 600;
      }

      &&:hover:not(:disabled) {
        background: ${theme.color.surfaceRaised};
      }
    `}
`
