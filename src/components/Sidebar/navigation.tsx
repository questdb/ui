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
    selected ? theme.color.contentAccent : theme.color.contentSecondary};

  &:hover:not([disabled]) {
    color: ${({ selected, theme }) =>
      selected ? theme.color.contentAccent : theme.color.contentPrimary};
    background: ${({ selected, theme }) =>
      selected
        ? theme.color.interactionAccentActive
        : theme.color.interactionHover};
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
