import React from "react"
import styled from "styled-components"
import Menu from "../../scenes/Editor/Menu"
import { Box } from "@questdb/react-components"
import { Version } from "./version"

const Root = styled(Box).attrs({
  align: "cneter",
  justifyContent: "space-between",
})`
  width: 100%;
  height: 4.5rem;
  background: ${({ theme }) => theme.color.backgroundDarker};
`

export const TopBar = () => {
  return (
    <Root>
      <Version />
      <Menu />
    </Root>
  )
}
