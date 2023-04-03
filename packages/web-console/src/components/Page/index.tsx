import React from "react"
import styled from "styled-components"
import { Text } from "../../components/Text"
import { PaneMenu } from "../../components/PaneMenu"
import { color } from "../../utils"

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 0;
  justify-content: flex-start;
  align-items: flex-start;
  background: ${color("draculaBackgroundDarker")};
  color: ${color("draculaForeground")};
  width: calc(100vw - 45px);
  height: 100vh;
`

const HeaderWrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 0;
  width: 100%;
`

const HeaderMenu = styled(PaneMenu)`
  & > :not(:first-child) {
    margin-left: 1rem;
  }
`

const Icon = styled.span`
  color: ${color("draculaForeground")};
`

type Props = {
  children: React.ReactNode
  icon?: React.ReactNode
  title?: string
}

export const Page = ({ children, icon, title }: Props) => (
  <Wrapper>
    {title && (
      <HeaderWrapper>
        <HeaderMenu>
          <Icon>{icon}</Icon>
          <Text color="draculaForeground">{title}</Text>
        </HeaderMenu>
      </HeaderWrapper>
    )}
    {children}
  </Wrapper>
)
