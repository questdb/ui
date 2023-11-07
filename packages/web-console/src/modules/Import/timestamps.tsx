import React from "react"
import styled from "styled-components"
import { PaneContent, PaneWrapper } from "../../components"
import { Panel } from "../../components/Panel"
import { TimestampFormatList } from "../../components/TimestampFormat/list"
import { Nav, NavGroup, Subheader } from "./panel"
import { ArrowRightS } from "@styled-icons/remix-line"

type Props = {
  open: boolean
  toggle: () => void
}

const Wrapper = styled(PaneWrapper)``

const Content = styled(PaneContent)``

export const GlobalTimestampsPanel = ({ open = true, toggle }: Props) => {
  return (
    <Wrapper>
      <Subheader>
        <NavGroup>
          <Nav>dummy</Nav>
        </NavGroup>
        <NavGroup>
          <Nav
            onClick={(e) => {
              e.preventDefault()
              toggle()
            }}
          >
            <ArrowRightS
              size={"18px"}
              style={{ transform: `rotate(${open ? 180 : 0}deg)` }}
            />
          </Nav>
        </NavGroup>
      </Subheader>
      <Content>
        <p>State: {open ? "open" : "closed"}</p>
        <TimestampFormatList />
      </Content>
    </Wrapper>
  )
}
