import React from "react"
import styled from "styled-components"
import { PaneContent, PaneWrapper } from "../../components"
import { Panel } from "../../components/Panel"
import { TimestampFormatList } from "../../components/TimestampFormat/list"
import { Nav, NavGroup, Subheader } from "./panel"
import { ArrowRightS } from "@styled-icons/remix-line"
import { useFormContext } from "react-hook-form"

type Props = {
  open: boolean
  toggle: () => void
}

const Wrapper = styled(PaneWrapper)``

const Content = styled(PaneContent)``

export const GlobalTimestampsPanel = ({ open = true, toggle }: Props) => {
  const { watch, setValue } = useFormContext()
  const override = watch("formats.behavior", "ADD") === "OVERRIDE"
  return (
    <Wrapper>
      <Subheader>
        <NavGroup>
          {open && (
            <Nav
              onClick={(e) => {
                e.preventDefault()
                setValue("formats.behavior", override ? "ADD" : "OVERRIDE")
              }}
            >
              <span>Override builtins</span>{" "}
              <small
                style={{
                  opacity: +override,
                }}
              >✔</small>
            </Nav>
          )}
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
