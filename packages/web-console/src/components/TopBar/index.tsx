import React from "react"
import styled from "styled-components"
import Menu from "../../scenes/Editor/Menu"

const Root = styled.div`
  display: flex;
  flex-shrink: 0;
  width: 100%;
  height: 4.5rem;
  background: ${({ theme }) => theme.color.backgroundDarker};
  padding: 0 1rem;
`

export const TopBar = () => {
  return (
    <Root>
      <Menu />
    </Root>
  )
}
