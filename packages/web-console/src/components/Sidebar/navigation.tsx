import styled from "styled-components"
import { PrimaryToggleButton } from ".."

type NavigationProps = Readonly<{
  selected: boolean
}>

export const Navigation = styled(PrimaryToggleButton)<NavigationProps>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;

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
