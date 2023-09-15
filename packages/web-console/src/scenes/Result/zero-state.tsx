import React from "react"
import styled from "styled-components"
import { PaneContent, PaneWrapper, Text } from "../../components"
import { Heading } from "@questdb/react-components"
import { useDispatch } from "react-redux"
import { actions } from "../../store"

const StyledPaneContent = styled(PaneContent)`
  align-items: center;
  justify-content: center;
`

const Items = styled.div`
  display: grid;
  grid-auto-flow: row;
  grid-auto-columns: max-content;
  gap: 2rem;
  text-align: center;
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

const RunLink = styled(Text)`
  cursor: pointer;
`

export const ZeroState = () => {
  const dispatch = useDispatch()

  return (
    <PaneWrapper>
      <StyledPaneContent>
        <Items>
          <StyledHeading level={3}>
            Enter a query and press{" "}
            <RunLink
              color="green"
              onClick={() => dispatch(actions.query.toggleRunning())}
            >
              Run
            </RunLink>{" "}
            to view results.
          </StyledHeading>
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
      </StyledPaneContent>
    </PaneWrapper>
  )
}
