import React from "react"
import styled from "styled-components"
import Menu from "../../scenes/Editor/Menu"
import { Box } from "../../components"
import { Toolbar } from "./toolbar"

const Root = styled(Box).attrs({
  align: "center",
  justifyContent: "space-between",
})`
  width: 100%;
  height: 4.5rem;
  background: ${({ theme }) => theme.color.backgroundDarker};
`

export const TopBar = () => {
  return (
    <Root>
      <Toolbar />
      <Menu />
    </Root>
  )
}
