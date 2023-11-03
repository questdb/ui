import React from "react"
import styled from "styled-components"
import { selectors } from "../../store"
import { Start } from "../../modules/ZeroState/start"
import { useSelector } from "react-redux"
import { PaneContent, PaneWrapper } from "../../components"

const StyledPaneContent = styled(PaneContent)`
  align-items: center;
  justify-content: center;
`

export const ZeroState = () => {
  const tables = useSelector(selectors.query.getTables)

  return (
    <PaneWrapper>
      <StyledPaneContent>{tables.length <= 2 && <Start />}</StyledPaneContent>
    </PaneWrapper>
  )
}
