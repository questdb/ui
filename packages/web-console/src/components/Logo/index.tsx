import React from "react"
import { useDispatch } from "react-redux"
import { actions } from "../../store"
import styled from "styled-components"
import { color } from "../../utils"

const Root = styled.div`
  position: relative;
  display: flex;
  width: 4.5rem;
  height: 4rem;
  background: ${color("black")};
  z-index: 1;
  align-items: center;
  justify-content: center;
  cursor: pointer;
`
export const Logo = () => {
  const dispatch = useDispatch()
  return (
    <Root onClick={() => dispatch(actions.console.setActivePanel("console"))}>
      <img alt="QuestDB Logo" height="26" src="/assets/favicon.svg" />
    </Root>
  )
}
