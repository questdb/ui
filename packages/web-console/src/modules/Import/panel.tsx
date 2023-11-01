import { PaneContent, PaneWrapper } from "../../components"
import styled from "styled-components"

type SubheaderProps = {
  children: React.ReactNode
}

export const Subheader = styled.nav<SubheaderProps>`
  position: relative;
  height: 4.5rem;
  padding: 0.5rem 0.5rem;
  font-size: 12px;

  display: flex;
  justify-content: space-between;

  background: ${({ theme }) => theme.color.backgroundLighter};
  border-block: 1px solid black;
`

export const NavGroup = styled.section`
  display: flex;
  gap: 1rem;
  height: 100%;
`

export const Nav = styled.div`
  all: unset;  
  background: ${({ theme }) => theme.color.transparent};
  color: ${({ theme }) => theme.color.foreground};
  
  display: flex;
  align-items: center;
  gap: .75rem;

  padding: .25rem .75rem;

  border-bottom: 1px solid ${({ theme }) => theme.color.transparent};

  &:hover {
    border-color: ${({ theme }) => theme.color.selection}
  }
`