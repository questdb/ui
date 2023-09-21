import React from "react"
import styled from "styled-components"
import { Text } from "../../components/Text"
import { PaneMenu } from "../../components/PaneMenu"
import { color } from "../../utils"
import { Sidebar } from "../../components/Sidebar"
import { Logo } from "../../components/Logo"
import { XLg } from "styled-icons/bootstrap"
import { useDispatch } from "react-redux"
import { actions } from "../../store"
import { Button } from "@questdb/react-components"

const Root = styled.div`
  display: flex;
  width: 100vw;
  height: 100vh;
`

const Wrapper = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  background: ${color("backgroundDarker")};
  color: ${color("foreground")};
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
  color: ${color("foreground")};
`

type Props = {
  children: React.ReactNode
  icon?: React.ReactNode
  title?: string
}

export const Page = ({ children, icon, title }: Props) => {
  const dispatch = useDispatch()

  return (
    <Root>
      <Sidebar>
        <Logo />
        <Button
          skin="secondary"
          type="button"
          onClick={() => dispatch(actions.console.setActivePanel("console"))}
        >
          <XLg size="18px" />
        </Button>
      </Sidebar>
      <Wrapper>
        {title && (
          <HeaderWrapper>
            <HeaderMenu>
              <Icon>{icon}</Icon>
              <Text color="foreground">{title}</Text>
            </HeaderMenu>
          </HeaderWrapper>
        )}
        {children}
      </Wrapper>
    </Root>
  )
}
