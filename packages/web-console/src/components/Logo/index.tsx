import React from "react"
import { useDispatch } from "react-redux"
import { actions } from "../../store"
import styled from "styled-components"
import { color } from "../../utils"
import { Information } from "@styled-icons/remix-line"
import { BUTTON_ICON_SIZE } from "../../consts/index"
import { PrimaryToggleButton } from "../../components"

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
    <Root>
      <PrimaryToggleButton
        onClick={() => dispatch(actions.console.setActivePanel("console"))}
      >
        <Information size={BUTTON_ICON_SIZE} />
      </PrimaryToggleButton>
      {/* <img alt="QuestDB Logo" height="23" src="/assets/favicon.svg" /> */}
    </Root>
  )
}
