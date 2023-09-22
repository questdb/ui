import React from "react"
import styled from "styled-components"
import { PaneContent, PaneWrapper, Text } from "../../components"
import { Heading } from "@questdb/react-components"

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

export const ZeroState = () => (
  <PaneWrapper>
    <StyledPaneContent>
      <Items>
        <StyledHeading level={3}>
          Enter a query and press <Text color="green">Run</Text> to view
          results.
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
