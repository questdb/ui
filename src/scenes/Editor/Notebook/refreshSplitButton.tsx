import styled from "styled-components"
import { Button } from "../../../components"

export const SplitButtonContainer = styled.div`
  display: flex;
  align-items: center;
  border-radius: 0.4rem;
  background: ${({ theme }) => theme.color.backgroundLighter};
  border: 1px solid ${({ theme }) => `${theme.color.selection}80`};
`

export const SplitSide = styled(Button)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 3rem;
  padding: 0 1.1rem;
  border: none;
  border-radius: 0;
  color: ${({ theme }) => theme.color.foreground};
  font-size: 1.4rem;
  cursor: pointer;

  svg {
    width: 1.8rem;
    height: 1.8rem;
  }

  &&:hover:not(:disabled):not([aria-disabled="true"]) {
    background: ${({ theme }) => `${theme.color.selection}80`};
    color: ${({ theme }) => theme.color.foreground};
  }

  &&:hover[aria-disabled="true"],
  &&:active[aria-disabled="true"] {
    background: transparent;
    color: ${({ theme }) => theme.color.foreground};
    filter: none;
  }

  &:disabled,
  &[aria-disabled="true"] {
    opacity: 0.5;
    cursor: default;
  }
`

export const SplitDivider = styled.div`
  width: 1px;
  align-self: stretch;
  margin: 0;
  background: ${({ theme }) => theme.color.selection};
`

export const IntervalLabel = styled.span`
  color: ${({ theme }) => theme.color.gray2};
`

export const OverrideDot = styled.span`
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.pinkPrimary};
  flex-shrink: 0;
`
