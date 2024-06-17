import React from "react"
import styled from "styled-components"
import { bezierTransition, Text } from "../../components"
import { Box, Heading } from "@questdb/react-components"
import { actions } from "../../store"
import { useDispatch } from "react-redux"

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

const StyledText = styled(Text)`
  line-height: 1.75;

  a {
    color: ${({ theme }) => theme.color.gray2};
  }
`

const Actions = styled.div`
  display: grid;
  gap: 2rem;
  grid-template-columns: repeat(2, 1fr);
`

const Action = styled(Box).attrs({ flexDirection: "column", gap: "2rem" })`
  padding: 2rem;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: #2c2e3d;
  cursor: pointer;

  &,
  &:hover {
    ${bezierTransition};
  }

  > * {
    opacity: 0.8;
  }

  &:hover {
    background: #3f4252;

    > * {
      opacity: 1;
    }
  }
`

export const Start = () => {
  const dispatch = useDispatch()

  return (
    <Items>
      <StyledHeading level={3}>
        Enter a query and press <Text color="green">Run</Text> to view results.
      </StyledHeading>
      <Actions>
        <Action
          onClick={() =>
            dispatch(actions.console.setActiveBottomPanel("import"))
          }
        >
          <img
            alt="File upload icon"
            width="60"
            height="80"
            src="assets/upload.svg"
          />
          <Heading level={5}>Import CSV</Heading>
        </Action>
        <Action
          onClick={() => dispatch(actions.console.setActiveSidebar("create"))}
        >
          <img
            alt="Create table icon"
            width="60"
            height="80"
            src="assets/create-table.svg"
          />
          <Heading level={5}>Create table</Heading>
        </Action>
      </Actions>
      <StyledText color="gray2">
        Get $200 in free credits when you sign up for{" "}
        <a
          href="https://questdb.io/cloud"
          target="_blank"
          rel="noopener noreferrer"
        >
          QuestDB Cloud
        </a>
        .<br />
        No credit card required.
      </StyledText>
    </Items>
  )
}
