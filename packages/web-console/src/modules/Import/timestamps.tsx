import React from "react"
import styled from "styled-components"
import { PaneContent, PaneWrapper } from "../../components"
import { TimestampFormatList } from "../../components/TimestampFormat/list"
import { Nav, NavGroup, Subheader } from "./panel"
import { ArrowLeftS, ArrowRightS } from "@styled-icons/remix-line"
import { useFieldArray, useFormContext } from "react-hook-form"

type Props = {
  open: boolean
  toggle: () => void
}

const Wrapper = styled(PaneWrapper)``

const Content = styled(PaneContent)``

export const GlobalTimestampsPanel = ({ open = true, toggle }: Props) => {
  const { watch, setValue } = useFormContext()
  const { fields, append, remove, update } = useFieldArray({
    name: "formats.patterns",
  })
  const override = watch("formats.behavior", "ADD") === "OVERRIDE"

  if (!open) {
    return (
      <Wrapper>
        <Subheader>
          <Nav onClick={() => toggle()}>
            <ArrowRightS size="18px"/>
          </Nav>
        </Subheader>
      </Wrapper>
    )
  }

  return (
    <Wrapper>
      <Subheader>
        <NavGroup>
          <Nav
            onClick={(e) => {
              setValue("formats.behavior", override ? "ADD" : "OVERRIDE")
            }}
          >
            <span>Override builtins</span>{" "}
            <small
              style={{
                opacity: +override,
              }}
            >
              ✔
            </small>
          </Nav>
          <Nav
            onClick={(e) => {
              append({ pattern: "" })
            }}
          >
            +
          </Nav>
        </NavGroup>
        <NavGroup>
          <Nav
            onClick={(e) => {
              e.preventDefault()
              toggle()
            }}
          >
            <ArrowLeftS size="18px" />
          </Nav>
        </NavGroup>
      </Subheader>
      <Content>
        <TimestampFormatList {...{ fields, remove, update }} />
      </Content>
    </Wrapper>
  )
}
