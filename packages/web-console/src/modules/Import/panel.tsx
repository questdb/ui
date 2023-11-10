import { PaneContent, PaneWrapper } from "../../components"
import styled from "styled-components"

type SubheaderProps = {
  children: React.ReactNode
}

export const Subheader = styled.nav.attrs({
  type: "button",
})`
  position: relative;
  height: 4.5rem;
  padding: 0.5rem 0.5rem;
  font-size: 12px;

  display: flex;
  justify-content: space-between;

  background: ${({ theme }) => theme.color.backgroundLighter};
  border-block: 1px solid black;
  border-inline-start: 1px solid rgba(0, 0, 0, 0.5);
`

export const NavGroup = styled.section`
  display: flex;
  gap: 1rem;
  height: 100%;
`

export const Nav = styled.button.attrs({
  tabIndex: 0,
  type: "button"
})`
  all: unset;
  background: ${({ theme }) => theme.color.transparent};
  color: ${({ theme }) => theme.color.foreground};

  display: flex;
  align-items: center;
  gap: 0.75rem;

  padding: 0.25rem 0.75rem;

  border-bottom: 1px solid ${({ theme }) => theme.color.transparent};

  &:hover, &:focus {
    border-color: ${({ theme }) => theme.color.selection};
  }

  &:disabled {
    opacity: 0.6;
    pointer-events: none;
  }
`
