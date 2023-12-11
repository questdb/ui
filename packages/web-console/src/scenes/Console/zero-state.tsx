import React from "react"
import styled from "styled-components"
import { Start } from "../../modules/ZeroState/start"
import { PaneContent, PaneWrapper } from "../../components"
import { selectors } from "../../store"
import { useSelector } from "react-redux"

const StyledPaneContent = styled(PaneContent)`
  align-items: center;
  justify-content: center;
`

export const ZeroState = () => {
  const { readOnly } = useSelector(selectors.console.getConfig)

  return (
    <PaneWrapper>
      <StyledPaneContent>{!readOnly && <Start />}</StyledPaneContent>
    </PaneWrapper>
  )
}
