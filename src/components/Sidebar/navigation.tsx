import styled from "styled-components"
import { PrimaryToggleButton } from ".."

type NavigationProps = Readonly<{
  selected: boolean
}>

export const Navigation = styled(PrimaryToggleButton)<NavigationProps>`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  width: 4rem;
  height: 4rem;
  border-radius: 0.6rem;
  color: ${({ selected, theme }) =>
    selected ? theme.color.brandAccent : theme.color.contentSecondary};

  &&[aria-pressed="true"] {
    background: ${({ theme }) => theme.color.brandAccentActive};
    color: ${({ theme }) => theme.color.brandAccent};
  }

  &:hover:not([disabled]) {
    color: ${({ selected, theme }) =>
      selected ? theme.color.brandAccent : theme.color.contentPrimary};
    background: ${({ selected, theme }) =>
      selected ? theme.color.brandAccentActive : theme.color.interactionHover};
  }

  &&[aria-pressed="true"]:hover:not([disabled]) {
    background: ${({ theme }) => theme.color.brandAccentActive};
    color: ${({ theme }) => theme.color.brandAccent};
  }

  & > span {
    margin-left: 0 !important;
  }

  & > :not(:first-child) {
    margin-top: 0.3rem;
  }
`

export const DisabledNavigation = styled.div`
  display: flex;
  position: relative;
  height: 100%;
  width: 100%;
  align-items: center;
  justify-content: center;

  &:disabled {
    pointer-events: none;
    cursor: default;
  }
`
