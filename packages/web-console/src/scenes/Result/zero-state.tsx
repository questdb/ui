import React from "react"
import styled from "styled-components"
import { PaneContent, PaneWrapper } from "../../components"
import { Button } from "@questdb/react-components"
import { useDispatch } from "react-redux"
import { actions } from "../../store"

const StyledPaneContent = styled(PaneContent)`
  align-items: center;
  justify-content: center;
`

const Items = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: max-content;
  gap: 2rem;
`

export const ZeroState = () => {
  const dispatch = useDispatch()

  return (
    <PaneWrapper>
      <StyledPaneContent>
        <Items>
          <Button
            skin="secondary"
            onClick={() => dispatch(actions.console.setActivePanel("news"))}
          >
            Enterprise news
          </Button>
        </Items>
      </StyledPaneContent>
    </PaneWrapper>
  )
}
