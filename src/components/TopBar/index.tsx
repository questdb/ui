import React from "react"
import styled from "styled-components"
import Menu from "../../scenes/Editor/Menu"
import { Box } from "../../components"
import { Toolbar } from "./toolbar"
import QuestDBLogo from "../../providers/SettingsProvider/QuestDBLogo"
import { TOP_BAR_HEIGHT } from "../../consts"

const Root = styled(Box).attrs({
  align: "center",
  justifyContent: "space-between",
})`
  width: 100%;
  height: ${TOP_BAR_HEIGHT};
  min-height: ${TOP_BAR_HEIGHT};
  gap: 0;
  background: ${({ theme }) => theme.color.surfaceBase};
  border-bottom: 1px solid ${({ theme }) => theme.color.borderSubtle};
  box-shadow: 0 6px 18px ${({ theme }) => theme.color.shadowSubtle};
  z-index: 30;
`

const Brand = styled.div`
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  gap: 1.2rem;
  padding: 0 2rem;
  height: 100%;
  overflow: hidden;
  border-right: 1px solid ${({ theme }) => theme.color.borderSubtle};
`

const Logo = styled.div`
  width: 9.5rem;
  flex: 0 0 9.5rem;
  line-height: 0;
  color: ${({ theme }) => theme.color.contentPrimary};

  svg {
    display: block;
    width: 100%;
    height: auto;
  }
`

export const TopBar = () => {
  return (
    <Root>
      <Brand>
        <Logo>
          <QuestDBLogo />
        </Logo>
        <Toolbar />
      </Brand>
      <Menu />
    </Root>
  )
}
