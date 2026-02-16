import React from "react"
import styled from "styled-components"
import { bezierTransition, Text, Heading } from "../../components"
import { actions } from "../../store"
import { useDispatch } from "react-redux"
import { useSettings } from "../../providers"

const Items = styled.div`
  display: grid;
  grid-auto-flow: row;
  grid-auto-columns: max-content;
  gap: 4rem;
  text-align: center;
  justify-items: center;
`

const StyledHeading = styled(Heading)`
  color: ${({ theme }) => theme.color.foreground};
`

const Action = styled.button`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: none;
  outline: none;
  gap: 2rem;
  padding: 2rem;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: #2c2e3d;
  cursor: pointer;
  color: ${({ theme }) => theme.color.foreground};

  &,
  &:hover:not([disabled]) {
    ${bezierTransition};
  }

  > * {
    opacity: 0.8;
  }

  &:hover:not([disabled]) {
    background: #3f4252;

    > * {
      opacity: 1;
    }
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`

export const Start = () => {
  const dispatch = useDispatch()
  const { consoleConfig } = useSettings()
  return (
    <Items>
      <StyledHeading level={3}>
        Enter a query and press <Text color="green">Run</Text> to view results.
      </StyledHeading>
      <Action
        disabled={consoleConfig.readOnly}
        onClick={() => dispatch(actions.console.setActiveBottomPanel("import"))}
      >
        <img
          alt="File upload icon"
          width="60"
          height="80"
          src="assets/upload.svg"
        />
        <Heading level={5}>Import CSV</Heading>
      </Action>
    </Items>
  )
}
